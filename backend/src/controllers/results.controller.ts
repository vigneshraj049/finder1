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
      `SELECT 
         p.id, 
         p.property_title, 
         p.property_type, 
         p.description, 
         p.budget,
         p.listing_type,
         p.address, 
         p.latitude, 
         p.longitude, 
         p.ai_score, 
         p.ai_summary, 
         p.created_at,
         p.instagram_post_status,
         p.instagram_post_id,
         p.instagram_error_log,
         p.instagram_draft_caption,
         p.instagram_draft_image_url,
         COALESCE(b.business_name, '') AS business_name,
         COALESCE(b.phone, '') AS contact_phone,
         COALESCE(b.email, '') AS contact_email,
         COALESCE(b.instagram_username, '') AS instagram_username,
         COALESCE(b.instagram_profile_url, '') AS instagram_profile_url,
         COALESCE(b.website, '') AS website,
         COUNT(sc.id)::int AS media_count,
         COUNT(CASE WHEN sc.media_type = 'reel' OR sc.video_url IS NOT NULL THEN 1 END)::int AS reels_count,
         COUNT(CASE WHEN sc.media_type = 'post' AND sc.video_url IS NULL THEN 1 END)::int AS images_count,
         COALESCE(
           json_agg(
             json_build_object(
               'id', sc.id,
               'media_type', sc.media_type,
               'content_type', sc.content_type,
               'content_url', sc.content_url,
               'media_url', sc.media_url,
               'video_url', sc.video_url,
               'caption', sc.caption,
               'likes_count', sc.engagement_count,
               'published_at', sc.published_at
             ) ORDER BY sc.created_at DESC
           ) FILTER (WHERE sc.id IS NOT NULL),
           '[]'::json
         ) AS media_items
       FROM properties p
       LEFT JOIN businesses b ON p.business_id = b.id
       LEFT JOIN social_contents sc ON sc.property_id = p.id
       WHERE p.search_request_id = $1
       GROUP BY p.id, b.id
       ORDER BY 
         (
           (CASE WHEN p.budget IS NOT NULL AND p.budget != 'NA' THEN 1 ELSE 0 END) +
           (CASE WHEN p.address IS NOT NULL AND p.address != 'NA' THEN 1 ELSE 0 END) +
           (CASE WHEN b.phone IS NOT NULL AND b.phone != '' THEN 1 ELSE 0 END) +
           (CASE WHEN b.email IS NOT NULL AND b.email != 'NA' AND b.email != '' THEN 1 ELSE 0 END)
         ) DESC,
         p.created_at DESC`,
      [searchRequestId]
    );

    const data = result.rows.map((row) => {
      const mediaItems = Array.isArray(row.media_items) ? row.media_items : [];
      const firstReel = mediaItems.find((m: any) => m.media_type === "reel" || m.video_url);
      const firstImage = mediaItems.find((m: any) => m.media_url);

      const reels = mediaItems
        .filter((m: any) => m.media_type === "reel" || m.video_url)
        .map((m: any) => m.video_url || m.content_url);

      return {
        ...row,
        contact_phone: row.contact_phone || "",
        contact_email: row.contact_email || "",
        contactNumber: row.contact_phone || "",
        contactEmail: row.contact_email || "",
        media_count: Number(row.media_count) || 0,
        reels_count: Number(row.reels_count) || 0,
        images_count: Number(row.images_count) || 0,
        media_type: firstReel ? "reel" : "post",
        video_url: firstReel?.video_url || "",
        media_url: firstImage?.media_url || "",
        thumbnail_url: firstImage?.media_url || firstReel?.media_url || "",
        reels,
        media_items: mediaItems,
      };
    });

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });

  } catch (error) {
    console.error("Error fetching property results:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch property results",
    });
  }
};

export const getAllPropertyResults = async (
  req: Request,
  res: Response
) => {
  try {
    const result = await pool.query(
      `SELECT 
         p.id, 
         p.property_title, 
         p.property_type, 
         p.description, 
         p.budget,
         p.listing_type,
         p.address, 
         p.latitude, 
         p.longitude, 
         p.ai_score, 
         p.ai_summary, 
         p.created_at,
         p.instagram_post_status,
         p.instagram_post_id,
         p.instagram_error_log,
         p.instagram_draft_caption,
         p.instagram_draft_image_url,
         COALESCE(b.business_name, '') AS business_name,
         COALESCE(b.phone, '') AS contact_phone,
         COALESCE(b.email, '') AS contact_email,
         COALESCE(b.instagram_username, '') AS instagram_username,
         COALESCE(b.instagram_profile_url, '') AS instagram_profile_url,
         COALESCE(b.website, '') AS website,
         COUNT(sc.id)::int AS media_count,
         COUNT(CASE WHEN sc.media_type = 'reel' OR sc.video_url IS NOT NULL THEN 1 END)::int AS reels_count,
         COUNT(CASE WHEN sc.media_type = 'post' AND sc.video_url IS NULL THEN 1 END)::int AS images_count,
         COALESCE(
           json_agg(
             json_build_object(
               'id', sc.id,
               'media_type', sc.media_type,
               'content_type', sc.content_type,
               'content_url', sc.content_url,
               'media_url', sc.media_url,
               'video_url', sc.video_url,
               'caption', sc.caption,
               'likes_count', sc.engagement_count,
               'published_at', sc.published_at
             ) ORDER BY sc.created_at DESC
           ) FILTER (WHERE sc.id IS NOT NULL),
           '[]'::json
         ) AS media_items
       FROM properties p
       LEFT JOIN businesses b ON p.business_id = b.id
       LEFT JOIN social_contents sc ON sc.property_id = p.id
       GROUP BY p.id, b.id
       ORDER BY 
         (
           (CASE WHEN p.budget IS NOT NULL AND p.budget != 'NA' THEN 1 ELSE 0 END) +
           (CASE WHEN p.address IS NOT NULL AND p.address != 'NA' THEN 1 ELSE 0 END) +
           (CASE WHEN b.phone IS NOT NULL AND b.phone != '' THEN 1 ELSE 0 END) +
           (CASE WHEN b.email IS NOT NULL AND b.email != 'NA' AND b.email != '' THEN 1 ELSE 0 END)
         ) DESC,
         p.created_at DESC`
    );

    const data = result.rows.map((row) => {
      const mediaItems = Array.isArray(row.media_items) ? row.media_items : [];
      const firstReel = mediaItems.find((m: any) => m.media_type === "reel" || m.video_url);
      const firstImage = mediaItems.find((m: any) => m.media_url);

      const reels = mediaItems
        .filter((m: any) => m.media_type === "reel" || m.video_url)
        .map((m: any) => m.video_url || m.content_url);

      return {
        ...row,
        contact_phone: row.contact_phone || "",
        contact_email: row.contact_email || "",
        contactNumber: row.contact_phone || "",
        contactEmail: row.contact_email || "",
        media_count: Number(row.media_count) || 0,
        reels_count: Number(row.reels_count) || 0,
        images_count: Number(row.images_count) || 0,
        media_type: firstReel ? "reel" : "post",
        video_url: firstReel?.video_url || "",
        media_url: firstImage?.media_url || "",
        thumbnail_url: firstImage?.media_url || firstReel?.media_url || "",
        reels,
        media_items: mediaItems,
      };
    });

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });

  } catch (error) {
    console.error("Error fetching all property results:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch all property results",
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