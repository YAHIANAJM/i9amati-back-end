// ========================================
// FILE 2: backend/routes/apartmentRoutes.js
// ========================================
import express from 'express';
import { auth, requireRole } from '../middleware/auth.js';
import {
  getApartmentsByBuilding,
  listApartments,
  deleteApartment,
  editApartment,
  getApartmentById
} from '../controllers/apartmentController.js';

const router = express.Router();

// List all apartments for current union agent
router.get('/:id', auth, requireRole('union_agent'), getApartmentById);

router.get('/apartments-inbuilding/:buildingId', auth, requireRole('union_agent'), getApartmentsByBuilding);

// Delete apartment
router.delete('/:apartmentId', auth, requireRole('union_agent'), deleteApartment);

// Edit apartment details
router.post('/edit', auth, requireRole('union_agent'), editApartment);

// Manage residents
//router.post('/residents/add', auth, requireRole('union_agent'), addResident);
//router.post('/residents/remove', auth, requireRole('union_agent'), removeResident);

export default router;