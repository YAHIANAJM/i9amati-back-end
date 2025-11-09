// ========================================
// FILE 3: backend/routes/propertyOwnerRoutes.js
// ========================================
import express from 'express';
import { auth, requireRole } from '../middleware/auth.js';
import {
  getOwnersByApartment,
  getOwnerApartment,
  addOwnerToApartment,
  removeOwnerFromApartment,
  updateOwnerInfo
} from '../controllers/propertyOwnerController.js';

const router = express.Router();

// Property owner gets their own apartment
router.get('/apartment', auth, requireRole('property_owner'), getOwnerApartment);

router.get('/:apartmentId/owners', auth, requireRole('union_agent'), getOwnersByApartment);

// Add owner to apartment
router.post('/:apartmentId', auth, requireRole('union_agent'), addOwnerToApartment);

// Remove owner from apartment
router.delete('/:apartmentId/:ownerId', auth, requireRole('union_agent'), removeOwnerFromApartment);

// Update owner information
router.put('/:apartmentId/:ownerId', auth, requireRole('union_agent'), updateOwnerInfo);

export default router;