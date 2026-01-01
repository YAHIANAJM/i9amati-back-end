import express from 'express';
import accountingController from '../controllers/accountingControllerNew.js';

const router = express.Router();

// Generate annual contributions
router.post('/contributions/generate', accountingController.generateAnnualContributions);

// Record payment with allocations
router.post('/payments', accountingController.recordPayment);

// Deposit checks to bank
router.post('/checks/deposit', accountingController.depositChecks);

// Get owner ledger/statement
router.get('/ledger/:owner_id', accountingController.getOwnerLedger);

// Get accounting summary
router.get('/summary', accountingController.getAccountingSummary);

// Get contributions with filters
router.get('/contributions', accountingController.getContributions);

// Setup: Assign representative users to apartments
router.post('/setup/assign-representatives', accountingController.assignRepresentativeUsers);

// Debug: Check apartment data structure
router.get('/setup/check-apartments', accountingController.checkApartmentData);

export default router;
