import express from 'express';
const router = express.Router();
import {
  exportGeneralLedgerExcel,
  exportJournalExcel,
  exportBalanceSheetExcel,
  exportManagementAccountExcel,
  exportOwnerContributionsExcel,
  exportCompleteAccountingExcel,
  exportBalanceSheetPDF,
  exportManagementAccountPDF,
  exportOwnerContributionsPDF,
  exportGeneralAssemblyReportPDF,
  exportLegalReportPDF,
  exportAnnexGenericExcel,
  exportAnnexGenericPDF,
} from '../controllers/exportController.js';

import { auth, requireRole } from '../middleware/auth.js';

// Apply authentication to all routes
router.use(auth);

// ============= EXCEL EXPORTS =============

// Export General Ledger to Excel
router.get('/excel/general-ledger/:residenceId/:year', exportGeneralLedgerExcel);

// Export Journal to Excel
router.get('/excel/journal/:residenceId/:year', exportJournalExcel);

// Export Balance Sheet (Annex 3) to Excel
router.get('/excel/balance-sheet/:residenceId/:year', exportBalanceSheetExcel);

// Export Management Account (Annex 4) to Excel
router.get('/excel/management-account/:residenceId/:year', exportManagementAccountExcel);

// Export Owner Contributions (Annex 10) to Excel
router.get('/excel/owner-contributions/:residenceId/:year', exportOwnerContributionsExcel);

// Export complete accounting package to Excel
router.get('/excel/complete/:residenceId/:year', exportCompleteAccountingExcel);

// Generic Excel export for all other annex types
router.get('/excel/:annexType/:residenceId/:year', exportAnnexGenericExcel);

// ============= PDF EXPORTS =============

// Export Balance Sheet (Annex 3) to PDF
router.get('/pdf/balance-sheet/:residenceId/:year', exportBalanceSheetPDF);

// Export Management Account (Annex 4) to PDF
router.get('/pdf/management-account/:residenceId/:year', exportManagementAccountPDF);

// Export Owner Contributions (Annex 10) to PDF
router.get('/pdf/owner-contributions/:residenceId/:year', exportOwnerContributionsPDF);

// Export comprehensive report for General Assembly
router.get('/pdf/general-assembly/:residenceId/:year', exportGeneralAssemblyReportPDF);

// Export legal/court report (requires union_agent role)
router.get('/pdf/legal-report/:residenceId/:year', requireRole(['union_agent']), exportLegalReportPDF);

// Generic PDF export for all other annex types
router.get('/pdf/:annexType/:residenceId/:year', exportAnnexGenericPDF);

export default router;
