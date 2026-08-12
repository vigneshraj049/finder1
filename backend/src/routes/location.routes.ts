import { Router } from "express";
import { getLocations } from "../controllers/location.controller";

const router = Router();

router.get("/", getLocations);

export default router;