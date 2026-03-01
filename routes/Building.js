import express from "express";
import { auth, requireRole } from "../middleware/auth.js";
import {
  getBuildings,
  getBuildingById,
  createBuildingWithApartmentAndOwners,
  deleteBuilding,
  createBuildingWithMultipleApartments,
  addApartmentWithOwnersToBuilding,
  updateBuilding,
} from "../controllers/buildingController.js";

const router = express.Router();

// Get all buildings (paginated - 10 per page)
router.get("/", auth, requireRole("union_agent"), getBuildings);

router.post(
  "/createBuildingWithMultipleApartments",
  auth,
  requireRole("union_agent"),
  createBuildingWithMultipleApartments,
); // Add the new route

// Get single building by ID
router.get("/:buildingId", auth, requireRole("union_agent"), getBuildingById);

// Create building with apartment and owners (3-step modal)
router.post(
  "/createBuildingWithApartmentAndOwners",
  auth,
  requireRole("union_agent"),
  createBuildingWithApartmentAndOwners,
);

// Delete building and all its apartments
router.delete("/:buildingId", auth, requireRole("union_agent"), deleteBuilding);

// Add new apartment with owners to existing building
router.post(
  "/:buildingId/apartments-with-owners",
  auth,
  requireRole("union_agent"),
  addApartmentWithOwnersToBuilding,
);

// Update building
router.patch("/:buildingId", auth, requireRole("union_agent"), updateBuilding);

export default router;
