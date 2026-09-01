import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import pool from "../config/database";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { uploadBase64Image, uploadRemoteImageToImageKit } from "../services/imagekit.service";
import {
  buildCaption,
  createMediaContainer,
  createCarouselContainer,
  createReelContainer,
  publishMedia,
  PropertyForCaption,
} from "../services/instagram.service";
import {
  analyzeReferencePoster,
  generateDesignPlan,
  DesignPlan,
} from "../services/gemini.service";

const IMAGE2_DEFAULT_STYLE =
  "Dark forest green solid top header with gold logo circle on left and gold circular badge seal on right. " +
  "Large central property photograph with rounded gold border frame. Dark green background behind bold yellow " +
  "primary headline zone and white secondary headline. Bright yellow horizontal pointed banner for sale badge. " +
  "White rounded info card with dark green icon rows for property details. Black contact footer bar with yellow " +
  "phone number and gold Instagram pill button. Color palette: deep emerald green #062f21, gold #d4af37, " +
  "bright yellow #facc15, pure white cards, black footer. Luxury corporate Indian real estate marketing flyer aesthetic.";

const IMAGE2_DEFAULT_VISUAL_PROMPT =
  "High-resolution, professional real estate architectural photography of a vacant residential land plot with clean boundary lines, asphalt road, green grass, trees, and a pleasant sky. Bright sunset lighting, award-winning composition, commercial property marketing photo. No text, no letters, no numbers, no logos, no watermark, no people, ultra high resolution.";

const IMAGE2_DEFAULT_DESIGN_PLAN: DesignPlan = {
  colors: {
    primaryBg: "#062f21",
    cardBg: "rgba(255, 255, 255, 0.95)",
    textPrimary: "#ffffff",
    textSecondary: "#ffe082",
    accentColor: "#facc15",
    borderGold: "#d4af37",
    featureBadgeBg: "rgba(6, 47, 33, 0.9)",
  },
  typography: {
    titleSize: 76,
    descSize: 28,
    priceSize: 34,
    ctaSize: 34,
  },
  highlights: [],
};

let cachedBrandWelcomeUrl: string | null = null;

const getBrandWelcomeUrl = async (): Promise<string> => {
  if (cachedBrandWelcomeUrl) return cachedBrandWelcomeUrl;

  const localPath = path.join(__dirname, "../../uploads/brand_welcome.png");
  if (!fs.existsSync(localPath)) {
    throw new Error(`brand_welcome.png not found at path: ${localPath}`);
  }

  const fileBuffer = fs.readFileSync(localPath);
  const base64DataUrl = `data:image/png;base64,${fileBuffer.toString("base64")}`;
  cachedBrandWelcomeUrl = await uploadBase64Image(base64DataUrl, "brand_welcome.png");
  return cachedBrandWelcomeUrl;
};

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
         COALESCE(b.phone, '')         AS contact_phone,
         COALESCE(b.instagram_username, '') AS instagram_username
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
      `SELECT content_url, media_url, video_url, media_type, raw_data FROM social_contents WHERE property_id = $1 ORDER BY created_at ASC`,
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

  // Extract original post media items (images and videos) — Meta Graph API carousel supports both
  const postUrls = socialContentsRows.map((r: any) => r.content_url).filter(Boolean);
  const originalMedia: { url: string; isVideo: boolean }[] = [];

  for (const row of socialContentsRows) {
    const isVideo = row.media_type === "reel" || row.media_type === "video" || !!row.video_url;
    const url = isVideo ? (row.video_url || row.media_url) : row.media_url;

    if (url) {
      const exists = originalMedia.some((m) => m.url === url);
      if (!exists) {
        originalMedia.push({ url, isVideo });
      }
    }

    try {
      const raw = typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : row.raw_data;
      if (raw && Array.isArray(raw.childPosts)) {
        for (const child of raw.childPosts) {
          const childIsVideo = child.videoUrl || child.video_url || child.isVideo;
          const childUrl = childIsVideo
            ? (child.videoUrl || child.video_url || child.displayUrl || child.display_url || child.media_url)
            : (child.displayUrl || child.display_url || child.media_url);

          if (childUrl) {
            const exists = originalMedia.some((m) => m.url === childUrl);
            if (!exists) {
              originalMedia.push({ url: childUrl, isVideo: !!childIsVideo });
            }
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

  // Upload or retrieve cached branding welcome slide
  let welcomeUrl: string;
  try {
    welcomeUrl = await getBrandWelcomeUrl();
  } catch (err: any) {
    console.error("[Instagram Publish] Failed to upload brand_welcome.png:", err.message);
    welcomeUrl = "";
  }

  // Upload all needed original media to ImageKit so Meta Graph API can fetch them without permission/OAuth errors
  // Upload all needed original media to ImageKit so Meta Graph API can fetch them without permission/OAuth errors
  const uploadedOriginalMedia: { url: string; isVideo: boolean }[] = [];
  const mediaToUpload = originalMedia.slice(0, 4); // Only need up to 4 original media items
  console.log(`[Instagram Publish] Pre-uploading ${mediaToUpload.length} original scraped media items to ImageKit...`);

  for (let idx = 0; idx < mediaToUpload.length; idx++) {
    const item = mediaToUpload[idx];
    if (!item || !item.url) continue;

    // If already an ImageKit URL, keep it directly
    if (item.url.includes("imagekit.io")) {
      uploadedOriginalMedia.push(item);
      continue;
    }

    try {
      const ext = item.isVideo ? "mp4" : "jpg";
      const filename = `listing_original_${propertyId}_${idx}_${Date.now()}.${ext}`;
      const ikUrl = await uploadRemoteImageToImageKit(item.url, filename);
      uploadedOriginalMedia.push({ url: ikUrl, isVideo: item.isVideo });
    } catch (err: any) {
      console.warn(`[Instagram Publish] Skipping media item ${idx} due to expired CDN URL:`, err.message);
      // Skip expired CDN URLs to prevent Meta Graph API 403/502 container failures
    }
  }

  // Create carousel URLs array: Flyer poster first, Listing media (photos + reels) second, Welcome branding last
  const carouselImages: { url: string; isVideo?: boolean }[] = [];
  carouselImages.push({ url: publicImageUrl, isVideo: false });
  carouselImages.push(...uploadedOriginalMedia);
  if (welcomeUrl) {
    carouselImages.push({ url: welcomeUrl, isVideo: false });
  }

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

  // Mention the promoter's Instagram username if available and not already in the caption
  if (propertyRow.instagram_username) {
    const handle = `@${propertyRow.instagram_username.replace(/^@/, "")}`;
    if (!caption.includes(handle)) {
      caption += `\n\nPromoted by: ${handle}`;
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
      message: `Instagram media container creation failed: ${containerErr.message}`,
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

    const response = await fetch(url, {
      signal: controller.signal as any,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
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

/**
 * Refresh expired Instagram CDN media_urls for a property by re-uploading to ImageKit.
 * POST /api/instagram/refresh-media  { propertyId }
 */
export const refreshMedia = async (req: Request, res: Response) => {
  const { propertyId } = req.body;
  if (!propertyId) {
    return res.status(400).json({ success: false, message: "Missing propertyId" });
  }

  try {
    // Get all social_contents for this property where media_url is a non-ImageKit URL
    const result = await pool.query(
      `SELECT id, media_url FROM social_contents WHERE property_id = $1 AND media_url IS NOT NULL`,
      [propertyId]
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, message: "No media to refresh.", refreshed: 0 });
    }

    let refreshed = 0;
    let failed = 0;

    for (const row of result.rows) {
      const mediaUrl: string = row.media_url;
      // Skip already-uploaded ImageKit URLs
      if (mediaUrl.includes("ik.imagekit.io")) {
        refreshed++;
        continue;
      }

      try {
        const filename = `refreshed_media_${propertyId}_${row.id}_${Date.now()}.jpg`;
        const ikUrl = await uploadRemoteImageToImageKit(mediaUrl, filename, "/scraped-media");
        await pool.query(
          `UPDATE social_contents SET media_url = $1 WHERE id = $2`,
          [ikUrl, row.id]
        );
        refreshed++;
        console.log(`[RefreshMedia] Updated social_content ${row.id} to ImageKit URL`);
      } catch (err: any) {
        console.warn(`[RefreshMedia] Failed for social_content ${row.id}: ${err.message}`);
        failed++;
      }
    }

    return res.json({
      success: true,
      message: `Refreshed ${refreshed} media URLs. Failed: ${failed}.`,
      refreshed,
      failed,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Failed to refresh media", error: error.message });
  }
};

// Generate Image 2 style marketing flyer background + design plan using Gemini + Pollinations Flux
const buildAiPosterPrompt = (
  category: string,
  listingType: string,
  budget: string,
  address: string,
  businessName: string,
  phone: string,
  instagramUsername: string,
  title: string
) => {
  return `Create a premium, professional REAL ESTATE ${category ? category.toUpperCase() : "LAND"} FOR ${listingType ? listingType.toUpperCase() : "SALE"} advertisement poster.

Use the provided property information to automatically create the complete poster layout. Organize the information using strong visual hierarchy similar to a professional real-estate social media advertisement.

DESIGN STYLE:
- Premium modern real-estate advertisement
- Clean, trustworthy and professional
- Main colors: dark green, white and golden yellow
- High-quality commercial poster design
- Realistic property photography
- Strong bold typography
- Clean spacing and alignment
- Instagram/social-media advertisement quality
- Portrait poster format

TOP SECTION:
Place the real-estate company logo and company name prominently at the top-left.
Below the company name, include a short tagline such as: "Your Dream Plot, Your Future Home!"
Add a small premium "REAL ESTATE" badge at the top-right.

PROPERTY HERO SECTION:
Use a large realistic photograph of the actual type of property being advertised.
For land/plot properties, show:
- Clean residential plot
- Developed road
- Green surroundings
- Trees and natural environment
- Clear blue sky
- Premium residential neighborhood appearance
The property image should occupy approximately 50–60% of the upper poster.
Create a modern curved/diagonal graphic separation between the text area and property image.

MAIN PROPERTY HEADLINE:
Display the most important property information in VERY LARGE bold typography.
Example:
"${budget ? budget.toUpperCase() : "2400 SQ.FT"}
${category ? category.toUpperCase() : "SOUTH FACING LAND"}"
Add a large yellow/gold banner underneath containing:
"FOR ${listingType ? listingType.toUpperCase() : "SALE"}"

LOCATION:
Create a dark-green rounded location banner with a location-pin icon.
Display:
"${address ? address.toUpperCase() : "KK NAGAR, TRICHY"}"

PROPERTY SUMMARY SECTION:
Below the hero image create a clean white section.
Headline:
"PRIME ${budget ? budget.toUpperCase() : "2400 SQ.FT"} ${category ? category.toUpperCase() : "SOUTH-FACING PLOT"}"
Subtitle:
"Ideal for Residential Construction"
Create 4 clean feature cards/icons horizontally.
CARD 1:
Property Size
"${budget ? budget.toUpperCase() : "2400 SQ.FT"}"
CARD 2:
Facing Direction
"SOUTH FACING"
CARD 3:
Prime Location
"${address ? address : "KK Nagar – EB Colony Central, Trichy"}"
CARD 4:
Property Purpose
"IDEAL FOR Residential Construction"
Use simple premium dark-green line icons for each feature.

CONTACT SECTION:
Create a strong dark-green and golden-yellow contact banner near the bottom.
Include a phone icon.
Display:
"CONTACT US"
Make the phone number extremely prominent and easy to read.
Also include available social-media information such as:
Instagram username: "${instagramUsername ? "@" + instagramUsername : ""}"

If video/reel information is provided, add a small badge such as:
"1 REEL AVAILABLE"

BOTTOM TAGLINE:
Add an elegant handwritten/script-style tagline:
"Right Location. Right Choice. Bright Future."

PROPERTY INFORMATION:
Company Name: ${businessName ? businessName.toUpperCase() : "FIND YOUR DREAM"}
Tagline: Your Dream Plot, Your Future Home!
Property Type: ${category ? category.toUpperCase() : "LAND"}
Property Size: ${budget ? budget : "2400 SQ.FT"}
Facing: SOUTH FACING
Location: ${address ? address : "KK Nagar – EB Colony Central, Trichy"}
City: Trichy
Purpose: RESIDENTIAL
Phone Number: ${phone ? phone : "8072455408"}
Instagram: ${instagramUsername ? instagramUsername : ""}

OUTPUT:
Create one finished, ready-to-post professional real-estate advertising poster, not a template, wireframe, JSON, or text description.`;
};

export const generatePoster = async (req: Request, res: Response) => {
  const {
    title,
    category,
    address,
    referenceImage,
    businessName,
    phone,
    instagramUsername,
    budget,
    listingType,
    description
  } = req.body;

  try {
    let designStyle = IMAGE2_DEFAULT_STYLE;
    if (referenceImage) {
      const analyzed = await analyzeReferencePoster(referenceImage);
      if (analyzed) designStyle = analyzed;
    }

    const planResult = await generateDesignPlan(
      title || "",
      category || "Real Estate",
      address || "",
      designStyle,
      2,
      description || ""
    );

    let visualPrompt = planResult?.visualPrompt || IMAGE2_DEFAULT_VISUAL_PROMPT;
    const designPlan = planResult?.designPlan || IMAGE2_DEFAULT_DESIGN_PLAN;

    // Clean up visualPrompt by removing newlines and carriage returns to prevent Cloudflare/WAF CRLF blocking (404/403)
    visualPrompt = visualPrompt.replace(/[\r\n]+/g, " ").trim();

    const url = `https://image.pollinations.ai/p/${encodeURIComponent(visualPrompt)}?width=1080&height=1350&nologo=true&model=flux`;
    console.log(`[Pollinations AI] Generating dynamic poster...`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Pollinations AI returned status ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    return res.json({
      success: true,
      dataUrl: `data:image/jpeg;base64,${base64}`,
      designPlan,
      visualPrompt,
    });
  } catch (error: any) {
    console.error("[Poster Generation] Failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Poster generation failed. Please check server network connection.",
      error: error.message,
    });
  }
};

// ── DELETE LISTING ───────────────────────────────────────────────────────────
export const deleteListing = async (req: Request, res: Response): Promise<any> => {
  const { propertyId } = req.body;
  if (!propertyId) {
    return res.status(400).json({ success: false, message: "propertyId is required." });
  }

  try {
    // Delete associated social_contents first (FK constraint)
    await pool.query("DELETE FROM social_contents WHERE property_id = $1", [propertyId]);
    // Delete the property itself
    const result = await pool.query("DELETE FROM properties WHERE id = $1 RETURNING id", [propertyId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Property not found." });
    }
    return res.status(200).json({ success: true, message: "Listing deleted successfully.", deletedId: propertyId });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Failed to delete listing.", error: err.message });
  }
};

// ── DELETE SINGLE MEDIA ITEM ──────────────────────────────────────────────────
export const deleteMedia = async (req: Request, res: Response): Promise<any> => {
  const { mediaId, mediaUrl, propertyId } = req.body;
  if (!mediaId && !mediaUrl) {
    return res.status(400).json({ success: false, message: "mediaId or mediaUrl is required." });
  }

  try {
    let result: any;
    if (mediaId) {
      result = await pool.query("DELETE FROM social_contents WHERE id = $1 RETURNING id", [mediaId]);
    } else if (mediaUrl && propertyId) {
      result = await pool.query(
        "DELETE FROM social_contents WHERE property_id = $1 AND (media_url = $2 OR video_url = $2 OR content_url = $2) RETURNING id",
        [propertyId, mediaUrl]
      );
    }

    if (result && result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Media item not found in DB." });
    }
    return res.status(200).json({ success: true, message: "Media item removed successfully." });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Failed to delete media item.", error: err.message });
  }
};

// ── PUBLISH REEL (NATIVE INSTAGRAM REEL) ──────────────────────────────────────
export const publishReel = async (req: Request, res: Response): Promise<any> => {
  const { propertyId, caption: suppliedCaption, videoUrl, simulate } = req.body;

  if (!propertyId || !videoUrl) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: propertyId and videoUrl are required.",
    });
  }

  try {
    // 1. Upload video to ImageKit if not already on ImageKit
    let publicVideoUrl = videoUrl;
    if (!videoUrl.includes("imagekit.io")) {
      console.log(`[Instagram Reel] Uploading video to ImageKit...`);
      const filename = `reel_${propertyId}_${Date.now()}.mp4`;
      publicVideoUrl = await uploadRemoteImageToImageKit(videoUrl, filename);
    }

    // 2. Load property details for caption
    const checkRes = await pool.query(
      `SELECT p.*, COALESCE(b.business_name, '') AS business_name, COALESCE(b.phone, '') AS contact_phone, COALESCE(b.instagram_username, '') AS instagram_username FROM properties p LEFT JOIN businesses b ON p.business_id = b.id WHERE p.id = $1`,
      [propertyId]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Property listing not found." });
    }

    const propertyRow = checkRes.rows[0];
    let caption = suppliedCaption?.trim() || buildCaption(propertyRow as PropertyForCaption);
    if (propertyRow.instagram_username) {
      const handle = `@${propertyRow.instagram_username.replace(/^@/, "")}`;
      if (!caption.includes(handle)) {
        caption += `\n\nPromoted by: ${handle}`;
      }
    }

    if (simulate === true) {
      const mockPostId = `sim_reel_${Date.now()}`;
      return res.status(200).json({
        success: true,
        message: "Reel simulation completed successfully.",
        data: { status: "Simulated", postId: mockPostId, videoUrl: publicVideoUrl },
      });
    }

    // 3. Create Reel Container
    console.log(`[Instagram Reel] Creating container for ${publicVideoUrl}...`);
    const creationId = await createReelContainer(publicVideoUrl, caption);

    // 4. Publish Reel
    console.log(`[Instagram Reel] Publishing container ${creationId}...`);
    const livePostId = await publishMedia(creationId);

    console.log(`[Instagram Reel] ✅ Reel published. Post ID: ${livePostId}`);
    return res.status(200).json({
      success: true,
      message: "Successfully published Reel to Instagram!",
      data: { status: "Published", postId: livePostId },
    });
  } catch (err: any) {
    console.error("[Instagram Reel] Failed:", err.message);
    return res.status(502).json({
      success: false,
      message: `Reel publishing failed: ${err.message}`,
      error: err.message,
    });
  }
};
