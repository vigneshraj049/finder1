import { Request, Response } from "express";
import pool from "../config/database";
import { runInstagramScraper, runReelScraper } from "../services/apify.service";
import { performRegexExtraction, extractFromImageOCR, normalizeListingData } from "../services/gemini.service";
import { findOrCreateBusiness } from "../services/business.service";
import { extractEmailFromWebsite } from "../utils/extractInfo";

const normalizeText = (text: string | null | undefined): string => {
  if (!text) return "";
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
};

const isSimilarAddress = (addr1: string | null | undefined, addr2: string | null | undefined): boolean => {
  if (!addr1 || !addr2 || addr1 === "NA" || addr2 === "NA") return false;
  const a = normalizeText(addr1);
  const b = normalizeText(addr2);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
};

const isSimilarTitle = (title1: string | null | undefined, title2: string | null | undefined): boolean => {
  if (!title1 || !title2 || title1 === "NA" || title2 === "NA") return false;
  const t1 = normalizeText(title1);
  const t2 = normalizeText(title2);
  if (!t1 || !t2) return false;
  if (t1.length < 5 || t2.length < 5) return t1 === t2;
  return t1.includes(t2) || t2.includes(t1);
};

const getNormalizedInstagramItem = (item: any, defaultMediaType: "post" | "reel" = "post") => {
  const contentUrl =
    item?.url ??
    item?.permalink ??
    item?.link ??
    item?.display_url ??
    item?.displayUrl ??
    item?.video_url ??
    item?.videoUrl ??
    item?.imageUrl ??
    item?.thumbnailUrl ??
    (item?.shortCode ? `https://www.instagram.com/p/${item.shortCode}/` : null);

  const mediaUrl =
    item?.displayUrl ??
    item?.display_url ??
    item?.thumbnailUrl ??
    item?.image ??
    item?.imageUrl ??
    item?.videoUrl ??
    item?.video_url ??
    item?.url ??
    null;

  const rawType = String(item?.type || item?.productType || "").toLowerCase();
  const isVideo =
    rawType.includes("video") ||
    rawType.includes("clip") ||
    rawType.includes("reel") ||
    defaultMediaType === "reel" ||
    !!item?.videoUrl ||
    !!item?.video_url ||
    (contentUrl && contentUrl.includes("/reel/"));

  const mediaType: "post" | "reel" = isVideo ? "reel" : "post";
  const contentType = isVideo
    ? "video"
    : rawType.includes("sidecar") || item?.type === "Sidecar"
    ? "carousel"
    : "image";

  const videoUrl = isVideo ? (item?.videoUrl || item?.video_url || null) : null;

  return {
    ...item,
    media_type: mediaType,
    content_type: contentType,
    content_url: contentUrl,
    media_url: mediaUrl,
    video_url: videoUrl,
    ownerUsername: item?.ownerUsername || item?.username || item?.owner?.username || "unknown",
    ownerId: item?.ownerId || item?.owner?.id || null,
    ownerFullName: item?.ownerFullName || item?.owner?.fullName || null,
    caption: item?.caption || item?.text || "",
    likesCount: item?.likesCount || item?.likeCount || 0,
    timestamp: item?.timestamp || item?.takenAt || null,
  };
};

export const startScraper = async (
  req: Request,
  res: Response
) => {
  const { searchRequestId } = req.params;

  try {
    const searchResult = await pool.query(
      `SELECT sr.id, sr.status, c.name AS category_name, l.name AS location_name
       FROM search_requests sr
       JOIN categories c ON sr.category_id = c.id
       JOIN locations l ON sr.location_id = l.id
       WHERE sr.id = $1`,
      [searchRequestId]
    );

    if (searchResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Search request not found",
      });
    }

    const searchRequest = searchResult.rows[0];

    if (searchRequest.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: `Search request is already ${searchRequest.status}`,
      });
    }

    await pool.query(
      `UPDATE search_requests SET status = 'RUNNING' WHERE id = $1`,
      [searchRequestId]
    );

    const hashtag = `${searchRequest.category_name}${searchRequest.location_name}`
      .toLowerCase()
      .replace(/\s+/g, "");

    console.log(`Starting scrapers for hashtag: #${hashtag}`);

    // Fetch both Posts and Reels in parallel
    const [postScraperResult, reelScraperResult] = await Promise.allSettled([
      runInstagramScraper({ hashtag, resultsLimit: 20 }),
      runReelScraper({ query: hashtag, resultsLimit: 20 }),
    ]);

    const postItems = postScraperResult.status === "fulfilled" ? (postScraperResult.value.items || []) : [];
    const reelItems = reelScraperResult.status === "fulfilled" ? (reelScraperResult.value.items || []) : [];

    console.log(`Scraped: ${postItems.length} post items, ${reelItems.length} reel items.`);

    const combinedRaw = [
      ...postItems.map((item) => getNormalizedInstagramItem(item, "post")),
      ...reelItems.map((item) => getNormalizedInstagramItem(item, "reel")),
    ];

    // In-memory deduplication by content URL
    const seenUrls = new Set<string>();
    const scrapedItems: any[] = [];
    for (const item of combinedRaw) {
      if (item.content_url && !seenUrls.has(item.content_url)) {
        seenUrls.add(item.content_url);
        scrapedItems.push(item);
      }
    }

    let newCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;

    for (const item of scrapedItems) {
      try {
        if (!item.content_url) {
          failedCount++;
          continue;
        }

        // Ignore posts older than 60 days
        if (item.timestamp) {
          const postDate = new Date(item.timestamp);
          const sixtyDaysAgo = new Date();
          sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
          
          if (postDate < sixtyDaysAgo) {
            console.log(`[Date Filter] Skipping post because it is older than 60 days (${item.timestamp})`);
            continue;
          }
        }

        // 1. RAW SCRAPER DATA & DATA VALIDATION
        const rawCaption = item.caption || "";
        const regexData = performRegexExtraction(rawCaption);
        
        let mergedData: any = {
          caption: rawCaption,
          phone: regexData.phone,
          email: regexData.email,
          budget: regexData.budget,
          ocr_address: "NA",
        };

        // Check which important fields are missing
        const missingFields = [];
        if (mergedData.phone === "NA") missingFields.push("contactPhone");
        if (mergedData.email === "NA") missingFields.push("contactEmail");
        if (mergedData.budget === "NA") missingFields.push("budgetText");
        // Always try to extract address from image since regex doesn't handle it
        missingFields.push("address");
        
        // 2 & 3. IMAGE ANALYSIS & VIDEO THUMBNAIL FALLBACK
        // If an image/thumbnail exists and important fields are missing, perform Vision OCR
        if (missingFields.length > 0 && item.media_url) {
          console.log(`[OCR] Missing ${missingFields.join(", ")} for ${item.ownerUsername}, running Image OCR fallback...`);
          const ocrData = await extractFromImageOCR(item.media_url, missingFields);
          
          // Merge the extracted information without overwriting existing valid scraper data
          if (ocrData.contactPhone && ocrData.contactPhone !== "NA" && mergedData.phone === "NA") mergedData.phone = ocrData.contactPhone;
          if (ocrData.contactEmail && ocrData.contactEmail !== "NA" && mergedData.email === "NA") mergedData.email = ocrData.contactEmail;
          if (ocrData.budgetText && ocrData.budgetText !== "NA" && mergedData.budget === "NA") mergedData.budget = ocrData.budgetText;
          if (ocrData.address && ocrData.address !== "NA") mergedData.ocr_address = ocrData.address;
        }

        // 3.5 WEBSITE EMAIL EXTRACTION FALLBACK
        if (mergedData.email === "NA") {
          const externalUrl = item.externalUrl || item.owner?.external_url || item.ownerExternalUrl || item.author?.externalUrl || item.biography_with_entities?.entities?.[0]?.url;
          if (externalUrl && !externalUrl.includes("instagram.com")) {
            console.log(`[Website Scraping] Email missing for ${item.ownerUsername}, checking website: ${externalUrl}`);
            const websiteEmail = await extractEmailFromWebsite(externalUrl);
            if (websiteEmail) {
              mergedData.email = websiteEmail;
              console.log(`[Website Scraping] Found email: ${websiteEmail}`);
            }
          }
        }

        // 4. FINAL LLM NORMALIZATION
        // Pass combined scraper + image + video data to LLM to produce one normalized final property object
        const extracted = await normalizeListingData(mergedData);
        const instagramUsername = item.ownerUsername || item.username || item.owner?.username || "unknown";
        const safeBusinessName = item.ownerFullName || instagramUsername || "Instagram Business";

        const validTitle = extracted.title !== "NA" ? extracted.title : null;
        const validDescription = extracted.description !== "NA" ? extracted.description : null;
        const validAddress = extracted.address !== "NA" ? extracted.address : null;
        const validPhone = extracted.contactPhone !== "NA" ? extracted.contactPhone : null;
        const validEmail = extracted.contactEmail !== "NA" ? extracted.contactEmail : null;
        const validBudget = extracted.budgetText !== "NA" ? extracted.budgetText : null;

        const businessId = await findOrCreateBusiness({
          instagramUsername,
          instagramPageId: item.ownerId || null,
          instagramProfileUrl: instagramUsername !== "unknown"
            ? `https://www.instagram.com/${instagramUsername}/`
            : null,
          businessName: safeBusinessName,
          phone: validPhone,
          email: validEmail,
          address: validAddress,
        });

        // Smart Combination Matching: Check existing properties globally
        const existingProperties = await pool.query(
          `SELECT p.id, p.property_title, p.description, p.address, p.budget, p.business_id, b.phone
           FROM properties p
           JOIN businesses b ON p.business_id = b.id
           WHERE (
               p.business_id = $1
               OR ($2::varchar IS NOT NULL AND b.phone = $2)
             )
           ORDER BY p.created_at DESC`,
          [businessId, validPhone]
        );

        let targetPropertyId: number | null = null;
        let matchedProperty: any = null;

        for (const prop of existingProperties.rows) {
          // 1. Address Match
          if (validAddress && prop.address && isSimilarAddress(validAddress, prop.address)) {
            targetPropertyId = prop.id;
            matchedProperty = prop;
            break;
          }
          // 2. Title Match
          if (validTitle && prop.property_title && isSimilarTitle(validTitle, prop.property_title)) {
            targetPropertyId = prop.id;
            matchedProperty = prop;
            break;
          }
          // 3. Same Business & Supplemental Media (e.g. reel with short/no caption)
          if (!validTitle && (!validAddress || isSimilarAddress(validAddress, prop.address))) {
            targetPropertyId = prop.id;
            matchedProperty = prop;
            break;
          }
        }

        if (targetPropertyId && matchedProperty) {
          // Enrich existing property if current post has more complete details
          const updatedTitle =
            (!matchedProperty.property_title || matchedProperty.property_title === "No title")
              ? (validTitle || matchedProperty.property_title)
              : matchedProperty.property_title;
          const updatedDesc = !matchedProperty.description ? (validDescription || matchedProperty.description) : matchedProperty.description;
          const updatedAddress = !matchedProperty.address ? (validAddress || matchedProperty.address) : matchedProperty.address;
          const updatedBudget = !matchedProperty.budget ? (validBudget || matchedProperty.budget) : matchedProperty.budget;

          if (
            updatedTitle !== matchedProperty.property_title ||
            updatedDesc !== matchedProperty.description ||
            updatedAddress !== matchedProperty.address ||
            updatedBudget !== matchedProperty.budget ||
            true // Always update to move the property into the latest search results
          ) {
            await pool.query(
              `UPDATE properties
               SET property_title = $1, description = $2, address = $3, budget = $4, search_request_id = $5
               WHERE id = $6`,
              [updatedTitle, updatedDesc, updatedAddress, updatedBudget, searchRequestId, targetPropertyId]
            );
          }
        } else {
          // Create a new Property listing
          const fallbackTitle = item.caption
            ? item.caption.trim().split("\n")[0].slice(0, 100)
            : `${searchRequest.category_name} in ${searchRequest.location_name}`;

          const propertyResult = await pool.query(
            `INSERT INTO properties
             (business_id, property_title, property_type, description, address, search_request_id, budget)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [
              businessId,
              validTitle || fallbackTitle,
              searchRequest.category_name,
              validDescription || (item.caption ? item.caption.slice(0, 500) : null),
              validAddress,
              searchRequestId,
              validBudget,
            ]
          );

          targetPropertyId = propertyResult.rows[0].id;
        }

        // Insert or update social content linked to targetPropertyId
        await pool.query(
          `INSERT INTO social_contents
           (business_id, property_id, platform, content_type, media_type, content_url, caption, media_url, video_url, hashtags, published_at, engagement_count, source, raw_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (platform, content_url) DO UPDATE
           SET property_id = EXCLUDED.property_id,
               business_id = EXCLUDED.business_id,
               media_url = COALESCE(EXCLUDED.media_url, social_contents.media_url),
               video_url = COALESCE(EXCLUDED.video_url, social_contents.video_url),
               media_type = EXCLUDED.media_type,
               content_type = EXCLUDED.content_type`,
          [
            businessId,
            targetPropertyId,
            "instagram",
            item.content_type,
            item.media_type,
            item.content_url,
            item.caption || null,
            item.media_url || null,
            item.video_url || null,
            Array.isArray(item.hashtags) ? item.hashtags : [],
            item.timestamp || null,
            item.likesCount || 0,
            "apify",
            JSON.stringify(item),
          ]
        );

        newCount++;
      } catch (itemError: any) {
        console.error("Error processing scraped item:", itemError);
        failedCount++;
      }
    }

    await pool.query(
      `UPDATE search_requests SET status = 'COMPLETED' WHERE id = $1`,
      [searchRequestId]
    );

    return res.status(200).json({
      success: true,
      message: "Scraping and listing merging completed successfully",
      data: {
        searchRequestId,
        hashtag,
        totalFetched: scrapedItems.length,
        newPostsSaved: newCount,
        duplicatesSkipped: duplicateCount,
        failed: failedCount,
      },
    });

  } catch (error) {
    console.error("Error running scraper:", error);

    await pool.query(
      `UPDATE search_requests SET status = 'FAILED' WHERE id = $1`,
      [searchRequestId]
    );

    return res.status(500).json({
      success: false,
      message: "Scraper failed to run",
    });
  }
};