import { Router } from "express";
import { publishPost, saveDraft, proxyImage, generatePoster, refreshMedia, deleteListing, deleteMedia, publishReel } from "../controllers/instagram.controller";

const router = Router();

router.post("/publish", publishPost);
router.post("/publish-reel", publishReel);
router.post("/draft", saveDraft);
router.get("/proxy-image", proxyImage);
router.post("/generate-poster", generatePoster);
router.post("/refresh-media", refreshMedia);
router.post("/delete-listing", deleteListing);
router.post("/delete-media", deleteMedia);

export default router;
