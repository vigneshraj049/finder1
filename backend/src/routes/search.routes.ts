import { Router } from "express";
import { createSearch } from "../controllers/search.controller";

const router = Router();

router.post("/", createSearch);

export default router;