import express from "express";
import { auth, requireRole } from "../middleware/auth.js";
import {
  getAgentProfile,
  updateAgentProfile,
  getAgentStats,
} from "../controllers/unionAgentController.js";

const router = express.Router();

router.get(
  "/union-agent/profile",
  auth,
  requireRole("union_agent"),
  getAgentProfile
);
router.put(
  "/union-agent/profile",
  auth,
  requireRole("union_agent"),
  updateAgentProfile
);
router.get(
  "/union-agent/stats",
  auth,
  requireRole("union_agent"),
  getAgentStats
);

export default router;
