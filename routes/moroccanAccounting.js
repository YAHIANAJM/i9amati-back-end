import express from 'express';
import { 
  getChartOfAccounts,
  getJournalBook,
  getGeneralLedger,
  getBudgetComparison,
  createBudget,
  getBalanceSheet,
  getIncomeStatement,
  getReserveFunds,
  getLoans,
  createLoan,
  getOwnerContributions,
  createOwnerContribution,
  createBulkContributions,
  getAnnualRevenue,
  recalculateAnnualRevenue,
  getAccountingDashboard,
  previewDistribution,
  getInventoryBook,
  createManualJournalEntry
} from '../controllers/moroccanAccountingController.js';
import { auth, requireRole } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(auth);

// Chart of Accounts
router.get('/chart-of-accounts', getChartOfAccounts);

// Digital Ledgers
router.get('/journal', getJournalBook); // دفتر اليومية
router.post('/journal', requireRole('union_agent'), createManualJournalEntry); // تسجيل عملية جديدة
router.get('/general-ledger', getGeneralLedger); // دفتر الأستاذ
router.get('/inventory-book', getInventoryBook); // دفتر الجرد - Art 8

// Budget System
router.get('/budget-comparison', getBudgetComparison); // 3-year comparison (n-1, n, n+1)
router.post('/budget', requireRole('union_agent'), createBudget);

// Financial Statements
router.get('/financial-statements/balance-sheet', getBalanceSheet); // الحصيلة
router.get('/financial-statements/income-statement', getIncomeStatement); // حساب التسيير

// Reserve Funds
router.get('/reserves', getReserveFunds); // احتياطيات

// Loans
router.get('/loans', getLoans);
router.post('/loans', requireRole('union_agent'), createLoan);

// Owner Contributions Tracking
router.get('/owner-contributions', getOwnerContributions);
router.post('/owner-contributions', requireRole('union_agent'), createOwnerContribution);
router.post('/bulk-contributions', requireRole('union_agent'), createBulkContributions);
router.post('/distribution-preview', requireRole('union_agent'), previewDistribution);

// Annual Revenue Calculation & Classification (Phase 1)
router.get('/annual-revenue/:residenceId/:year', getAnnualRevenue);
router.post('/annual-revenue/recalculate', requireRole('union_agent'), recalculateAnnualRevenue);

// Accounting Dashboard
router.get('/dashboard/:residenceId/:year', getAccountingDashboard);

export default router;
