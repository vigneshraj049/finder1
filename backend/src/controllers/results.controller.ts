import { Request, Response } from "express";
import pool from "../config/database";
import { extractPhoneNumber, extractPrice } from "../utils/extractInfo";

export const getResults = async (
  req: Request,
  res: Response
) => {
  const { searchRequestId } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, instagram_id, short_code, caption, hashtags, display_url,
              owner_username, owner_full_name, post_url, likes_count, timestamp,
              phone_number, price_text
       FROM scraped_posts
       WHERE search_request_id = $1
       ORDER BY timestamp DESC`,
      [searchRequestId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });

  } catch (error) {
    console.error("Error fetching results:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch results",
    });
  }
};

export const getPropertyResults = async (
  req: Request,
  res: Response
) => {
  const { searchRequestId } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, property_title, property_type, description, budget,
              address, latitude, longitude, ai_score, ai_summary, created_at
       FROM properties
       WHERE search_request_id = $1
       ORDER BY created_at DESC`,
      [searchRequestId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });

  } catch (error) {
    console.error("Error fetching property results:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch property results",
    });
  }
};

// One-time cleanup endpoint: extracts phone/price for existing rows missing them
export const enrichResults = async (
  req: Request,
  res: Response
) => {
  try {
    const posts = await pool.query(
      `SELECT id, caption FROM scraped_posts WHERE phone_number IS NULL OR price_text IS NULL`
    );

    let updatedCount = 0;

    for (const post of posts.rows) {
      const phone = extractPhoneNumber(post.caption);
      const price = extractPrice(post.caption);

      if (phone || price) {
        await pool.query(
          `UPDATE scraped_posts SET phone_number = $1, price_text = $2 WHERE id = $3`,
          [phone, price, post.id]
        );
        updatedCount++;
      }
    }

    return res.status(200).json({
      success: true,
      message: "Enrichment completed",
      totalChecked: posts.rows.length,
      updatedCount,
    });

  } catch (error) {
    console.error("Error enriching results:", error);
    return res.status(500).json({
      success: false,
      message: "Enrichment failed",
    });
  }
};