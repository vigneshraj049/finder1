import { Router } from "express";
import { getResults, getPropertyResults, getAllPropertyResults, enrichResults } from "../controllers/results.controller";

const router = Router();

router.get("/enrich", enrichResults);
router.get("/all-properties", getAllPropertyResults);
router.get("/properties/:searchRequestId", getPropertyResults);
router.get("/:searchRequestId", getResults);

export default router;