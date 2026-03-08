import express from 'express';
const router = express.Router();
import {
  generateAnnex3,
  generateAnnex4,
  generateAnnex5,
  generateAnnex6,
  generateAnnex7,
  generateAnnex8,
  generateAnnex9,
  generateAnnex10,
  generateAnnex11,
  generateAnnex12,
  generateAnnex13,
  generateAnnex13bis,
  generateAnnex14,
  getAnnexStatus,
  getAnnex,
  generateAllAnnexesForLevel,
} from '../controllers/annexController.js';

import { auth, requireRole } from '../middleware/auth.js';

// Apply authentication to all routes
router.use(auth);

// Get all annexes status for a residence and year
router.get('/status/:residenceId/:year', getAnnexStatus);

// Get single annex
router.get('/:residenceId/:year/:annexNumber', getAnnex);

// Generate specific annexes (union_agent only)
router.post('/generate/annex3/:residenceId/:year', requireRole(['union_agent']), generateAnnex3);
router.post('/generate/annex4/:residenceId/:year', requireRole(['union_agent']), generateAnnex4);
router.post('/generate/annex5/:residenceId/:year', requireRole(['union_agent']), generateAnnex5);
router.post('/generate/annex6/:residenceId/:year', requireRole(['union_agent']), generateAnnex6);
router.post('/generate/annex7/:residenceId/:year', requireRole(['union_agent']), generateAnnex7);
router.post('/generate/annex8/:residenceId/:year', requireRole(['union_agent']), generateAnnex8);
router.post('/generate/annex9/:residenceId/:year', requireRole(['union_agent']), generateAnnex9);
router.post('/generate/annex10/:residenceId/:year', requireRole(['union_agent']), generateAnnex10);
router.post('/generate/annex11/:residenceId/:year', requireRole(['union_agent']), generateAnnex11);
router.post('/generate/annex12/:residenceId/:year', requireRole(['union_agent']), generateAnnex12);
router.post('/generate/annex13/:residenceId/:year', requireRole(['union_agent']), generateAnnex13);
router.post('/generate/annex13bis/:residenceId/:year', requireRole(['union_agent']), generateAnnex13bis);
router.post('/generate/annex14/:residenceId/:year', requireRole(['union_agent']), generateAnnex14);

// Generate all required annexes for a level
router.post('/generate/all/:residenceId/:year/:level', requireRole(['union_agent']), generateAllAnnexesForLevel);

export default router;
