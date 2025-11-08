// backend/routes/unionAgent.js
// Union Agent routes

import express from 'express';
import { auth, requireRole } from '../middleware/auth.js';
import {
  listApartments,
  addApartment,
  getOwnerApartment,
  addResident,
  removeResident,
  editApartment,
  deleteApartment,
  deleteBuilding,
  removeOwnerFromApartment,
  updateOwnerInfo,
  addOwnerByApartmentName,
  addOwnerToApartment,
  createBuildingWithApartmentAndOwners,
  getBuildingsForAgent
} from '../controllers/unionAgentController.js';

const router = express.Router();

// Health for union routes
router.get('/', (_req, res) => {
  res.send('Union Agent route');
});

// List all apartments for current union agent
router.get('/apartments', auth, requireRole('union_agent'), listApartments);


// Create a new apartment under current union agent
router.post('/apartments', auth, requireRole('union_agent'), addApartment);

// Property owner fetches their apartment
router.get('/owner/apartment', auth, requireRole('property_owner'), getOwnerApartment);

//get all building for that user union agent
router.get('/buildings', 
  auth, 
  requireRole('union_agent'), 
  getBuildingsForAgent
);

// Manage residents (union agent only)
router.post('/apartments/residents/add', auth, requireRole('union_agent'), addResident);
router.post('/apartments/residents/remove', auth, requireRole('union_agent'), removeResident);

router.post('/buildings/createBuildingWithApartmentAndOwners', auth, requireRole('union_agent'), createBuildingWithApartmentAndOwners);

// Edit apartment details (name)
router.post('/apartments/edit', auth, requireRole('union_agent'), editApartment);

// Frontend-compatible endpoints
router.delete('/apartments/:apartmentId', auth, requireRole('union_agent'), deleteApartment);
router.delete('/apartments/:apartmentId/owner/:ownerId', auth, requireRole('union_agent'), removeOwnerFromApartment);
router.put('/apartments/:apartmentId/owner/:ownerId', auth, requireRole('union_agent'), updateOwnerInfo);
router.post('/apartments/:apartmentId/owner', auth, requireRole('union_agent'), addOwnerToApartment);

// Add owner by apartment name (find or create apartment when building provided)
router.post('/apartments/owner-by-name', auth, requireRole('union_agent'), addOwnerByApartmentName);

// Delete all apartments under a building (and their owner/resident users)
router.delete('/buildings/:buildingName', auth, requireRole('union_agent'), deleteBuilding);

export default router;
