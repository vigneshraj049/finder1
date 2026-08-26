import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import pool from "../config/database";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { uploadBase64Image } from "../services/imagekit.service";
import {
  buildCaption,
  createMediaContainer,
  createCarouselContainer,
  publishMedia,
  PropertyForCaption,
} from "../services/instagram.service";

export const publishPost = async (req: Request, res: Response) => {
  const { propertyId, caption: suppliedCaption, imageBase64, simulate } = req.body;

  if (!propertyId || !imageBase64) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: propertyId and imageBase64 are required.",
    });
  }

  // ── 1. Load property and associated original social contents from DB ────────
  let propertyRow: any;
  let socialContentsRows: any[] = [];
  try {
    const checkRes = await pool.query(
      `SELECT
         p.id, p.property_title, p.property_type, p.budget, p.listing_type,
         p.address, p.description,
         p.instagram_post_status, p.instagram_post_id,
         COALESCE(b.business_name, '') AS business_name,
         COALESCE(b.phone, '')         AS contact_phone
       FROM properties p
       LEFT JOIN businesses b ON p.business_id = b.id
       WHERE p.id = $1`,
      [propertyId]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Property listing not found." });
    }

    propertyRow = checkRes.rows[0];

    // Load original scraped post images & URLs
    const mediaRes = await pool.query(
      `SELECT content_url, media_url, raw_data FROM social_contents WHERE property_id = $1 ORDER BY created_at ASC`,
      [propertyId]
    );
    socialContentsRows = mediaRes.rows;
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Database error while loading property.", error: err.message });
  }

  // Prevent double-publishing
  if (propertyRow.instagram_post_status === "Published" && propertyRow.instagram_post_id) {
    return res.status(400).json({
      success: false,
      message: `Already published to Instagram (Post ID: ${propertyRow.instagram_post_id}).`,
    });
  }

  // Extract original post URLs and display images
  const postUrls = socialContentsRows.map((r: any) => r.content_url).filter(Boolean);
  const originalImages: string[] = [];

  for (const row of socialContentsRows) {
    if (row.media_url && !originalImages.includes(row.media_url)) {
      originalImages.push(row.media_url);
    }
    try {
      const raw = typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : row.raw_data;
      if (raw && Array.isArray(raw.childPosts)) {
        for (const child of raw.childPosts) {
          const childUrl = child.displayUrl || child.display_url || child.media_url;
          if (childUrl && !originalImages.includes(childUrl)) {
            originalImages.push(childUrl);
          }
        }
      }
    } catch (e) {
      // Ignore JSON parse errors
    }
  }

  // ── 2. Upload generated flyer image to ImageKit FIRST ────────────────────────
  let publicImageUrl: string;
  const filename = `poster_${propertyId}_${Date.now()}.png`;

  try {
    publicImageUrl = await uploadBase64Image(imageBase64, filename);
  } catch (uploadErr: any) {
    console.error("[ImageKit] Upload failed:", uploadErr.message);
    return res.status(400).json({
      success: false,
      message: `Image upload to ImageKit failed: ${uploadErr.message}`,
    });
  }

  // Create carousel URLs array: Generated Flyer goes first, followed by up to 4 original post images
  const carouselImages = [publicImageUrl, ...originalImages.slice(0, 4)];

  // ── 3. Now mark as Publishing ────────────────────────────────────────────────
  await pool.query(
    "UPDATE properties SET instagram_post_status = 'Publishing', instagram_error_log = NULL WHERE id = $1",
    [propertyId]
  );

  // ── 4. Simulation mode ───────────────────────────────────────────────────────
  if (simulate === true) {
    const mockPostId = `sim_post_${Date.now()}`;
    await pool.query(
      "UPDATE properties SET instagram_post_status = 'Simulated', instagram_post_id = $1 WHERE id = $2",
      [mockPostId, propertyId]
    );
    return res.status(200).json({
      success: true,
      message: "Simulation completed successfully (not published to live Instagram).",
      data: { status: "Simulated", postId: mockPostId, imageUrls: carouselImages },
    });
  }

  // ── 5. Build caption ─────────────────────────────────────────────────────────
  let caption = suppliedCaption?.trim();
  if (!caption) {
    caption = buildCaption(propertyRow as PropertyForCaption);
    if (postUrls.length > 0) {
      const shortcodes = postUrls.map((url: string) => {
        const match = url.match(/\/p\/([a-zA-Z0-9_-]+)/);
        return match ? match[1] : url;
      });
      caption += `\n\nFor more information check post: ${shortcodes.join(", ")}`;
    }
  }

  // ── 6. Create Instagram media container (Carousel vs Single Image) ──────────
  let creationId: string;
  try {
    if (carouselImages.length > 1) {
      console.log(`[Instagram] Creating carousel container with ${carouselImages.length} slides...`);
      creationId = await createCarouselContainer(carouselImages, caption);
    } else {
      console.log(`[Instagram] Creating single image container...`);
      creationId = await createMediaContainer(publicImageUrl, caption);
    }
  } catch (containerErr: any) {
    console.error("[Instagram] Container creation failed:", containerErr.message);
    await pool.query(
      "UPDATE properties SET instagram_post_status = 'Failed', instagram_error_log = $1 WHERE id = $2",
      [containerErr.message, propertyId]
    );
    return res.status(502).json({
      success: false,
      message: "Instagram media container creation failed.",
      error: containerErr.message,
    });
  }

  // ── 7. Publish the container ─────────────────────────────────────────────────
  let livePostId: string;
  try {
    livePostId = await publishMedia(creationId);
  } catch (publishErr: any) {
    console.error("[Instagram] Publish failed:", publishErr.message);
    await pool.query(
      "UPDATE properties SET instagram_post_status = 'Failed', instagram_error_log = $1 WHERE id = $2",
      [publishErr.message, propertyId]
    );
    return res.status(502).json({
      success: false,
      message: "Instagram media publish failed.",
      error: publishErr.message,
    });
  }

  // ── 8. Mark as Published in DB ───────────────────────────────────────────────
  await pool.query(
    "UPDATE properties SET instagram_post_status = 'Published', instagram_post_id = $1, instagram_error_log = NULL WHERE id = $2",
    [livePostId, propertyId]
  );

  console.log(`[Instagram Publish] ✅ Property ${propertyId} published. Post ID: ${livePostId}`);

  return res.status(200).json({
    success: true,
    message: "Successfully published to Instagram!",
    data: {
      status: "Published",
      postId: livePostId,
      imageUrls: carouselImages,
      caption,
    },
  });
};



export const saveDraft = async (req: Request, res: Response) => {
  const { propertyId, caption, imageBase64 } = req.body;

  if (!propertyId || !caption || !imageBase64) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: propertyId, caption, or imageBase64",
    });
  }

  try {
    // 1. Decode and save base64 image to uploads/ folder
    const matches = imageBase64.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ success: false, message: "Invalid base64 image data format" });
    }

    const ext = matches[1];
    const data = matches[2];
    const buffer = Buffer.from(data, "base64");
    const filename = `draft_${propertyId}.${ext}`;
    const uploadsDir = path.join(__dirname, "../../uploads");
    
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, buffer);

    const draftUrl = `/uploads/${filename}`;

    // 2. Update DB with Draft status, caption and image url
    const updateRes = await pool.query(
      "UPDATE properties SET instagram_post_status = 'Draft', instagram_draft_caption = $1, instagram_draft_image_url = $2, instagram_error_log = NULL WHERE id = $3 RETURNING *",
      [caption, draftUrl, propertyId]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Property listing not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Draft saved successfully",
      draftUrl,
    });
  } catch (error: any) {
    console.error("Error saving Instagram draft:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error occurred while saving draft",
      error: error.message,
    });
  }
};

// Proxy a remote image URL through the backend to bypass browser CORS restrictions
export const proxyImage = async (req: Request, res: Response) => {
  const { url } = req.query as { url?: string };

  if (!url) {
    return res.status(400).json({ success: false, message: "Missing url query parameter" });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for AI generation

    const response = await fetch(url, { signal: controller.signal as any });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        message: `Remote image fetch failed with status ${response.status}`,
      });
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    return res.json({
      success: true,
      dataUrl: `data:${contentType};base64,${base64}`,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Failed to proxy image",
      error: error.message,
    });
  }
};
// Generate a complete real-estate advertisement poster using Gemini Image Generation
export const generatePoster = async (req: Request, res: Response) => {
  const { businessName, title, category, budget, address, phone, description, instagramUsername, listingType } = req.body;

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ success: false, message: "GEMINI_API_KEY not configured" });
  }

  const CREATIVE_DIRECTOR_PROMPT = `You are an expert AI creative director and professional real-estate advertisement designer.

Your task is to transform the REAL ESTATE INFORMATION provided by the user into a complete, visually powerful, professional real-estate advertisement poster.

There will be NO reference poster.

Every request may contain completely different information. Analyze the supplied content first and dynamically decide the best poster design.

## CONTENT ANALYSIS

Understand the supplied information and automatically identify:
* Project / Property Name
* Property Type
* Price / Starting Price / Rent
* BHK
* Plot or Property Size
* Location
* Important Landmark
* Main Selling Point
* Special Offer / Discount
* Amenities
* Nearby Places
* Approval Information
* Loan / Finance Information
* Contact Information
* Address
* Any other useful property information

Do NOT require all of these fields.
Different advertisements may contain completely different information.
Never invent missing property information.

## VISUAL PRIORITY

Determine the visual hierarchy automatically.
The most commercially important information must receive the strongest visual emphasis.

## DYNAMIC DESIGN

Do NOT use one fixed template for every advertisement.
Create the layout dynamically based on the supplied information.

## PROPERTY VISUAL

Generate a suitable photorealistic hero visual based on the property information.

Residential Plot: Show a premium plotted development, internal roads, landscaping, entrance gate and infrastructure.
Villa: Show an elegant modern villa or villa community.
Apartment: Show a premium residential apartment development.
Commercial Property: Show a professional commercial building.

## DESIGN QUALITY

Create a premium commercial real-estate advertisement.
Choose an appropriate color palette based on the property positioning.
Luxury → dark premium tones + metallic accents.
Affordable housing → clean, bright, trustworthy colors.
Plots / land → green, blue and natural tones.

## TEXT ACCURACY

This is extremely important. Preserve EXACTLY:
* Project names
* Prices
* Phone numbers
* Locations
* Measurements
* Offers
* Approval names
* Addresses

Make important text large and readable.

## FINAL OUTPUT

Generate a FINISHED REAL-ESTATE ADVERTISEMENT POSTER IMAGE.
Vertical portrait advertisement. Suitable for Instagram, Facebook, WhatsApp.
High-resolution professional commercial design.

---

REAL ESTATE INFORMATION:

- Project / Business Name: ${businessName || ""}
- Property Title: ${title || ""}
- Property Type: ${category || ""}
- Price / Budget: ${budget || ""}
- Location / Address: ${address || ""}
- Contact Phone: ${phone || ""}
- Description / Highlights: ${description || ""}
- Listing Type: For ${listingType || "Sale"}
${instagramUsername ? `- Instagram: @${instagramUsername}` : ""}`;

  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ success: false, message: "GEMINI_API_KEY not configured in .env" });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: CREATIVE_DIRECTOR_PROMPT }] }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] } as any,
    });

    const candidate = result.response.candidates?.[0];
    if (!candidate) {
      return res.status(500).json({ success: false, message: "Gemini returned no candidates" });
    }

    // Find image part in response
    const imagePart = candidate.content?.parts?.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));
    if (!imagePart || !(imagePart as any).inlineData) {
      return res.status(500).json({ success: false, message: "Gemini did not return an image. The model may not support image generation on this API key tier." });
    }

    const { mimeType, data } = (imagePart as any).inlineData;
    return res.json({
      success: true,
      dataUrl: `data:${mimeType};base64,${data}`,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Gemini image generation failed",
      error: error.message,
    });
  }
};
