// ========================================
// FILE 2: backend/routes/apartmentRoutes.js
// ========================================
import express from "express";
import { auth, requireRole } from "../middleware/auth.js";
import {
  getApartmentsByBuilding,
  listApartments,
  deleteApartment,
  editApartment,
  getApartmentById,
  createApartmentForBuilding,
  exportBuildingApartmentsExcel,
  exportAllApartmentsExcel,
} from "../controllers/apartmentController.js";

const router = express.Router();

// Export routes (must come before /:id to avoid param clash)
router.get("/export/all", auth, requireRole("union_agent"), exportAllApartmentsExcel);
router.get("/export/building/:buildingId", auth, requireRole("union_agent"), exportBuildingApartmentsExcel);

// List all apartments for current union agent
router.get("/", auth, requireRole("union_agent"), listApartments);

router.get("/:id", auth, requireRole("union_agent"), getApartmentById);

router.get(
  "/apartments-inbuilding/:buildingId",
  auth,
  requireRole("union_agent"),
  getApartmentsByBuilding,
);

// Delete apartment
router.delete(
  "/:apartmentId",
  auth,
  requireRole("union_agent"),
  deleteApartment,
);

router.patch("/:apartmentId", auth, requireRole("union_agent"), editApartment);

// Edit apartment details
// Create new apartment for building
router.post(
  "/createApartmentForBuilding",
  auth,
  requireRole("union_agent"),
  createApartmentForBuilding,
);

// Manage residents
//router.post('/residents/add', auth, requireRole('union_agent'), addResident);
//router.post('/residents/remove', auth, requireRole('union_agent'), removeResident);

export default router;
