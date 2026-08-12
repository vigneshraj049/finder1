import { Router } from "express";
import { scoreProperties } from "../controllers/scoring.controller";

const router = Router();

router.post("/:searchRequestId", scoreProperties);

export default router;
