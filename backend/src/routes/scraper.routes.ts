import { Router } from "express";
import { startScraper } from "../controllers/scraper.controller";

const router = Router();

router.post("/start/:searchRequestId", startScraper);

export default router;