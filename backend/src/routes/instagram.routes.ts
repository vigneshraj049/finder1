import { Router } from "express";
import { publishPost, saveDraft, proxyImage, generatePoster, refreshMedia } from "../controllers/instagram.controller";

const router = Router();

router.post("/publish", publishPost);
router.post("/draft", saveDraft);
router.get("/proxy-image", proxyImage);
router.post("/generate-poster", generatePoster);
router.post("/refresh-media", refreshMedia);

export default router;
