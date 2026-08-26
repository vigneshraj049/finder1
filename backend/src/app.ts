import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import pool from "./config/database";

import categoryRoutes from "./routes/category.routes";
import locationRoutes from "./routes/location.routes";
import searchRoutes from "./routes/search.routes";
import scraperRoutes from "./routes/scraper.routes";
import resultsRoutes from "./routes/results.routes";
import scoringRoutes from "./routes/scoring.routes";
import instagramRoutes from "./routes/instagram.routes";

const ensureSchemaColumns = async () => {
  try {
    await pool.query(`
      ALTER TABLE social_contents
        ADD COLUMN IF NOT EXISTS media_type VARCHAR(20) NOT NULL DEFAULT 'post',
        ADD COLUMN IF NOT EXISTS video_url TEXT;
    `);

    await pool.query(`
      ALTER TABLE businesses
        ADD COLUMN IF NOT EXISTS instagram_profile_url TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    `);

    await pool.query(`
      ALTER TABLE properties
        ADD COLUMN IF NOT EXISTS instagram_post_status VARCHAR(30) NOT NULL DEFAULT 'Not Posted',
        ADD COLUMN IF NOT EXISTS instagram_post_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS instagram_error_log TEXT,
        ADD COLUMN IF NOT EXISTS instagram_draft_caption TEXT,
        ADD COLUMN IF NOT EXISTS instagram_draft_image_url TEXT;
    `);

    // Ensure uploads directory exists
    const uploadsDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    console.log("Database schema check complete for properties and social content columns.");
  } catch (error) {
    console.error("Unable to ensure required database schema columns:", error);
  }
};

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" })); // Support large base64 poster uploads

// Routes
app.use("/api/categories", categoryRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/scraper", scraperRoutes);
app.use("/api/results", resultsRoutes);
app.use("/api/scoring", scoringRoutes);
app.use("/api/instagram", instagramRoutes);
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.get("/", (req, res) => {
  res.json({
    message: "Finder API is running",
  });
});

app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      status: "success",
      message: "Database connected successfully",
      time: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      status: "error",
      message: "Database connection failed",
    });
  }
});

const PORT = process.env.PORT || 5000;

ensureSchemaColumns();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});