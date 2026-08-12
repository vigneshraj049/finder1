import { Request, Response } from "express";
import pool from "../config/database";
import { runInstagramScraper } from "../services/apify.service";
import { normalizeScrapedPost, NormalizedScrapedPost } from "../services/normalization.service";

const findBusinessId = async (normalized: NormalizedScrapedPost) => {
  if (normalized.instagramPageId) {
    const result = await pool.query(
      `SELECT id FROM businesses WHERE instagram_page_id = $1 LIMIT 1`,
      [normalized.instagramPageId]
    );
    if (result.rows.length > 0) return result.rows[0].id;
  }

  if (normalized.phone) {
    const result = await pool.query(
      `SELECT id FROM businesses WHERE phone = $1 LIMIT 1`,
      [normalized.phone]
    );
    if (result.rows.length > 0) return result.rows[0].id;
  }

  return null;
};

const upsertBusiness = async (normalized: NormalizedScrapedPost) => {
  const matchedBusinessId = await findBusinessId(normalized);

  if (matchedBusinessId) {
    await pool.query(
      `UPDATE businesses SET
         business_name = COALESCE(NULLIF($1, ''), business_name),
         phone = COALESCE(NULLIF($2, ''), phone),
         email = COALESCE(NULLIF($3, ''), email),
         address = COALESCE(NULLIF($4, ''), address),
         latitude = COALESCE($5, latitude),
         longitude = COALESCE($6, longitude),
         instagram_username = COALESCE(NULLIF($7, ''), instagram_username),
         instagram_page_id = COALESCE(NULLIF($8, ''), instagram_page_id)
       WHERE id = $9`,
      [
        normalized.businessName,
        normalized.phone,
        normalized.email,
        normalized.address,
        normalized.latitude,
        normalized.longitude,
        normalized.instagramPageName,
        normalized.instagramPageId,
        matchedBusinessId,
      ]
    );

    return matchedBusinessId;
  }

  const insertResult = await pool.query(
    `INSERT INTO businesses
       (business_name, phone, email, address, latitude, longitude, instagram_username, instagram_page_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
    [
      normalized.businessName,
      normalized.phone,
      normalized.email,
      normalized.address,
      normalized.latitude,
      normalized.longitude,
      normalized.instagramPageName,
      normalized.instagramPageId,
    ]
  );

  return insertResult.rows[0].id;
};

const insertProperty = async (
  businessId: number,
  searchRequestId: number,
  normalized: NormalizedScrapedPost
) => {
  await pool.query(
    `INSERT INTO properties
       (business_id, search_request_id, property_title, property_type, description, budget, address, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      businessId,
      searchRequestId,
      normalized.propertyTitle,
      normalized.propertyType,
      normalized.description,
      normalized.budget,
      normalized.address,
      normalized.latitude,
      normalized.longitude,
    ]
  );
};

export const startScraper = async (
  req: Request,
  res: Response
) => {
  const { searchRequestId } = req.params;

  try {
    // 1. Fetch search request with category + location
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

    // 2. Update status to RUNNING
    await pool.query(
      `UPDATE search_requests SET status = 'RUNNING' WHERE id = $1`,
      [searchRequestId]
    );

    // 3. Build combined hashtag (e.g. "realestatetrichy")
    const hashtag = `${searchRequest.category_name}${searchRequest.location_name}`
      .toLowerCase()
      .replace(/\s+/g, "");

    // 4. Run Apify scraper
    const scraperResult = await runInstagramScraper({
      hashtag,
      resultsLimit: 20,
    });

    // 5. Save each post individually, skipping duplicates
    let newCount = 0;
    let duplicateCount = 0;

    for (const item of scraperResult.items as any[]) {
      const normalized = normalizeScrapedPost(item);

      const archiveResult = await pool.query(
        `INSERT INTO scraped_posts
         (search_request_id, instagram_id, short_code, caption, hashtags, display_url, owner_username, owner_full_name, post_url, likes_count, timestamp, phone_number, price_text)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (search_request_id, instagram_id) DO NOTHING
         RETURNING id`,
        [
          searchRequestId,
          item.id,
          item.shortCode || null,
          normalized.description,
          JSON.stringify(normalized.hashtags || []),
          normalized.postUrl,
          normalized.instagramPageName,
          normalized.instagramPageId,
          normalized.postUrl,
          item.likesCount || 0,
          normalized.scrapedAt,
          normalized.phone,
          normalized.budget,
        ]
      );

      if (archiveResult.rows.length > 0) {
        newCount++;
        const businessId = await upsertBusiness(normalized);
        await insertProperty(businessId, searchRequestId, normalized);
      } else {
        duplicateCount++;
      }
    }

    // 6. Update status to COMPLETED
    await pool.query(
      `UPDATE search_requests SET status = 'COMPLETED' WHERE id = $1`,
      [searchRequestId]
    );

    return res.status(200).json({
      success: true,
      message: "Scraping completed successfully",
      data: {
        searchRequestId,
        hashtag,
        totalFetched: scraperResult.items.length,
        newPostsSaved: newCount,
        duplicatesSkipped: duplicateCount,
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