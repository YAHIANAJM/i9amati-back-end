import express from "express";
import { auth, requireRole } from "../middleware/auth.js";
import {
  createResidenceWithBuildingsAndApartments,
  getResidences,
} from "../controllers/residenceController.js";

const router = express.Router();

router.get("/", auth, requireRole("union_agent"), getResidences);
router.post("/create", auth, requireRole("union_agent"), createResidenceWithBuildingsAndApartments);

export default router;
