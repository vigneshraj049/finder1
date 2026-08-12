import { Request, Response } from "express";
import pool from "../config/database";

export const getCategories = async (
  req: Request,
  res: Response
) => {
  try {
    const result = await pool.query(
      `SELECT id, name, status, created_at
       FROM categories
       WHERE status = 'ACTIVE'
       ORDER BY name ASC`
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching categories:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch categories",
    });
  }
};