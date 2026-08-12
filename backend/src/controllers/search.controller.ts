import { Request, Response } from "express";
import pool from "../config/database";

export const createSearch = async (
  req: Request,
  res: Response
) => {
  try {
    const { categoryId, locationId } = req.body;

    // Validate input
    if (!categoryId || !locationId) {
      return res.status(400).json({
        success: false,
        message: "categoryId and locationId are required",
      });
    }

    // Check category
    const categoryResult = await pool.query(
      `SELECT id, name
       FROM categories
       WHERE id = $1
       AND status = 'ACTIVE'`,
      [categoryId]
    );

    if (categoryResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Check location
    const locationResult = await pool.query(
      `SELECT id, name, state, country
       FROM locations
       WHERE id = $1
       AND status = 'ACTIVE'`,
      [locationId]
    );

    if (locationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Location not found",
      });
    }

    // Create search request
    const result = await pool.query(
      `INSERT INTO search_requests
       (category_id, location_id, status)
       VALUES ($1, $2, 'PENDING')
       RETURNING id, category_id, location_id, status, created_at`,
      [categoryId, locationId]
    );

    const searchRequest = result.rows[0];

    return res.status(201).json({
      success: true,
      message: "Search request created successfully",
      data: {
        searchRequest,
        category: categoryResult.rows[0],
        location: locationResult.rows[0],
      },
    });

  } catch (error) {
    console.error("Error creating search request:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create search request",
    });
  }
};