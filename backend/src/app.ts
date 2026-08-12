import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./config/database";

import categoryRoutes from "./routes/category.routes";
import locationRoutes from "./routes/location.routes";
import searchRoutes from "./routes/search.routes";
import scraperRoutes from "./routes/scraper.routes";
import resultsRoutes from "./routes/results.routes";
import scoringRoutes from "./routes/scoring.routes";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/categories", categoryRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/scraper", scraperRoutes);
app.use("/api/results", resultsRoutes);
app.use("/api/scoring", scoringRoutes);

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});