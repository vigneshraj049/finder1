import { Request, Response } from "express";
import pool from "../config/database";

export const getLocations = async (
  req: Request,
  res: Response
) => {
  try {
    const result = await pool.query(
      `SELECT id, name, state, country, latitude, longitude, status, created_at
       FROM locations
       WHERE status = 'ACTIVE'
       ORDER BY name ASC`
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching locations:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch locations",
    });
  }
};