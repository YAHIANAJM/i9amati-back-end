import express from "express";
import { auth, requireRole } from "../middleware/auth.js";
import {
  getResidences,
  getResidenceById,
  createResidence,
  updateResidence,
  deleteResidence,
} from "../controllers/residenceController.js";

const router = express.Router();

// Get all residences for the agent
router.get("/", auth, requireRole("union_agent"), getResidences);

// Get single residence
router.get("/:id", auth, requireRole("union_agent"), getResidenceById);

// Create residence
router.post("/", auth, requireRole("union_agent"), createResidence);

// Update residence
router.patch("/:id", auth, requireRole("union_agent"), updateResidence);

// Delete residence
router.delete("/:id", auth, requireRole("union_agent"), deleteResidence);

export default router;
