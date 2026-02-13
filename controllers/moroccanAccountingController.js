import Account from '../models/Account.js';
import JournalEntry from '../models/JournalEntry.js';
import JournalLine from '../models/JournalLine.js';
import GeneralLedger from '../models/GeneralLedger.js';
import Budget from '../models/Budget.js';
import Loan from '../models/Loan.js';
import Contribution from '../models/Contribution.js';
import Payment from '../models/Payment.js';
import Apartment from '../models/Apartment.js';
import mongoose from 'mongoose';

/**
 * GET /api/accounting/moroccan/chart-of-accounts
 * Get complete Moroccan chart of accounts organized by class
 */
export const getChartOfAccounts = async (req, res) => {
  try {
    const accounts = await Account.find({ isActive: true }).sort({ number: 1 });
    
    // Group by class
    const byClass = {
      1: [], // Equity
      3: [], // Assets/Receivables
      4: [], // Liabilities
      5: [], // Treasury
      6: [], // Expenses
      7: []  // Revenues
    };
    
    accounts.forEach(account => {
      if (byClass[account.class]) {
        byClass[account.class].push(account);
      }
    });
    
    res.json({
      accounts: byClass,
      total: accounts.length,
      classes: {
        1: 'Equity & Reserves / الحقوق الخاصة',
        3: 'Assets & Receivables / الأصول والديون الدائنة',
        4: 'Liabilities / الديون والخصوم',
        5: 'Treasury / الخزينة',
        6: 'Expenses / التكاليف',
        7: 'Revenues / العائدات'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/accounting/moroccan/journal
 * Get Journal entries (دفتر اليومية) with pagination
 */
export const getJournalBook = async (req, res) => {
  try {
    const { residenceId, startDate, endDate, page = 1, limit = 50 } = req.query;
    
    const query = {};
    
    // Only filter by residence if provided
    if (residenceId) {
      query.residence_id = residenceId;
    }
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    const skip = (page - 1) * limit;
    
    const [entries, total] = await Promise.all([
      JournalEntry.find(query)
        .populate('lines')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      JournalEntry.countDocuments(query)
    ]);
    
    // Populate account names for lines
    for (const entry of entries) {
      for (const line of entry.lines) {
        const account = await Account.findOne({ number: line.accountNumber });
        line._doc.accountName = account?.name || 'Unknown';
      }
    }
    
    res.json({
      entries,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/accounting/moroccan/general-ledger
 * Get General Ledger (دفتر الأستاذ) for specific account or all
 */
export const getGeneralLedger = async (req, res) => {
  try {
    const { residenceId, accountNumber, startDate, endDate, year } = req.query;
    
    let query = { isReversed: false };
    
    // Only filter by residence if provided
    if (residenceId) {
      query.residence_id = residenceId;
    }
    
    if (accountNumber) {
      query.accountNumber = accountNumber;
      
      // Get ledger entries with running balance
      const ledger = await GeneralLedger.getAccountLedger(
        residenceId,
        accountNumber,
        startDate ? new Date(startDate) : new Date(year, 0, 1),
        endDate ? new Date(endDate) : new Date()
      );
      
      // Get account info
      const account = await Account.findOne({ number: accountNumber });
      
      return res.json({
        account,
        ledger,
        total: ledger.length
      });
    }
    
    // Get trial balance (all accounts summary)
    const fiscalYear = year ? parseInt(year) : new Date().getFullYear();
    const trialBalance = await GeneralLedger.getTrialBalance(residenceId, fiscalYear);
    
    res.json({
      trialBalance,
      fiscalYear
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/accounting/moroccan/budget-comparison
 * Get 3-year budget comparison (n-1, n, n+1) per Annex 5
 */
export const getBudgetComparison = async (req, res) => {
  try {
    const { residenceId, year } = req.query;
    
    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    
    // Get 3-year comparison
    const comparison = await Budget.getThreeYearComparison(residenceId, currentYear);
    
    // Get variance analysis for current year
    const variance = await Budget.getVarianceAnalysis(residenceId, currentYear);
    
    res.json({
      comparison,
      variance,
      years: {
        previous: currentYear - 1,
        current: currentYear,
        next: currentYear + 1
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/accounting/moroccan/budget
 * Create or update budget entries
 */
export const createBudget = async (req, res) => {
  try {
    const { residenceId, year, budgetType, entries, approvedBy } = req.body;
    
    if (!residenceId || !year || !budgetType || !entries) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const budgetEntries = [];
    
    for (const entry of entries) {
      const budget = await Budget.findOneAndUpdate(
        {
          residence_id: residenceId,
          year: year,
          budgetType: budgetType,
          accountNumber: entry.accountNumber
        },
        {
          amount: entry.amount,
          notes: entry.notes,
          approvedAt: new Date(),
          approvedBy: approvedBy
        },
        { upsert: true, new: true }
      );
      
      budgetEntries.push(budget);
    }
    
    res.json({
      success: true,
      count: budgetEntries.length,
      budgets: budgetEntries
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/accounting/moroccan/financial-statements/balance-sheet
 * Generate Balance Sheet (الحصيلة) per Annex 3
 */
export const getBalanceSheet = async (req, res) => {
  try {
    const { residenceId, year, asOfDate } = req.query;
    
    const fiscalYear = year ? parseInt(year) : new Date().getFullYear();
    const dateLimit = asOfDate ? new Date(asOfDate) : new Date(fiscalYear, 11, 31);
    
    // Get all account balances
    const accounts = await Account.find({ isActive: true });
    const balances = {};
    
    for (const account of accounts) {
      const balance = await GeneralLedger.getAccountBalance(
        residenceId,
        account.number,
        dateLimit
      );
      
      if (balance !== 0) {
        balances[account.number] = {
          name: account.name,
          class: account.class,
          type: account.type,
          balance: balance
        };
      }
    }
    
    // Organize by Balance Sheet sections
    const assets = {}; // Classes 3, 5 (if debit balance)
    const liabilities = {}; // Classes 4, 5 (if credit balance)
    const equity = {}; // Class 1
    
    Object.entries(balances).forEach(([accountNumber, data]) => {
      if (data.class === 1) {
        equity[accountNumber] = data;
      } else if (data.class === 3 || (data.class === 5 && data.balance > 0)) {
        assets[accountNumber] = data;
      } else if (data.class === 4 || (data.class === 5 && data.balance < 0)) {
        liabilities[accountNumber] = data;
      }
    });
    
    // Calculate totals
    const totalAssets = Object.values(assets).reduce((sum, a) => sum + Math.abs(a.balance), 0);
    const totalLiabilities = Object.values(liabilities).reduce((sum, l) => sum + Math.abs(l.balance), 0);
    const totalEquity = Object.values(equity).reduce((sum, e) => sum + Math.abs(e.balance), 0);
    
    res.json({
      balanceSheet: {
        assets,
        liabilities,
        equity,
        totals: {
          assets: totalAssets,
          liabilities: totalLiabilities,
          equity: totalEquity,
          liabilitiesAndEquity: totalLiabilities + totalEquity
        }
      },
      asOfDate: dateLimit,
      fiscalYear
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/accounting/moroccan/financial-statements/income-statement
 * Generate Income Statement (حساب التسيير) per Annex 4
 */
export const getIncomeStatement = async (req, res) => {
  try {
    const { residenceId, year, startDate, endDate } = req.query;
    
    const fiscalYear = year ? parseInt(year) : new Date().getFullYear();
    const start = startDate ? new Date(startDate) : new Date(fiscalYear, 0, 1);
    const end = endDate ? new Date(endDate) : new Date(fiscalYear, 11, 31);
    
    // Get accounts for revenues (Class 7) and expenses (Class 6)
    const accounts = await Account.find({ 
      isActive: true,
      class: { $in: [6, 7] }
    });
    
    const revenues = {};
    const expenses = {};
    
    for (const account of accounts) {
      // Get transactions for this period
      const query = {
        accountNumber: account.number,
        date: { $gte: start, $lte: end },
        isReversed: false
      };
      
      // Only filter by residence if provided
      if (residenceId) {
        query.residence_id = residenceId;
      }
      
      const entries = await GeneralLedger.find(query);
      
      const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
      const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);
      const netAmount = totalCredit - totalDebit; // For revenue accounts
      
      if (netAmount !== 0) {
        const data = {
          name: account.name,
          amount: Math.abs(netAmount)
        };
        
        if (account.class === 7) {
          revenues[account.number] = data;
        } else if (account.class === 6) {
          expenses[account.number] = data;
        }
      }
    }
    
    // Calculate totals and net result
    const totalRevenues = Object.values(revenues).reduce((sum, r) => sum + r.amount, 0);
    const totalExpenses = Object.values(expenses).reduce((sum, e) => sum + e.amount, 0);
    const netResult = totalRevenues - totalExpenses;
    
    res.json({
      incomeStatement: {
        revenues,
        expenses,
        totals: {
          revenues: totalRevenues,
          expenses: totalExpenses,
          netResult: netResult,
          resultType: netResult >= 0 ? 'surplus' : 'deficit'
        }
      },
      period: {
        start,
        end,
        fiscalYear
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/accounting/moroccan/reserves
 * Calculate and get reserve funds (احتياطيات) per Article 37
 */
export const getReserveFunds = async (req, res) => {
  try {
    const { residenceId, year } = req.query;
    
    const fiscalYear = year ? parseInt(year) : new Date().getFullYear();
    const asOfDate = new Date(fiscalYear, 11, 31);
    
    // Get reserve accounts (111, 1111, 1112)
    const reserveGeneral = await GeneralLedger.getAccountBalance(residenceId, '111', asOfDate);
    const reserveUnexpected = await GeneralLedger. getAccountBalance(residenceId, '1111', asOfDate);
    const reserveLongTerm = await GeneralLedger.getAccountBalance(residenceId, '1112', asOfDate);
    
    res.json({
      reserves: {
        '111': {
          name: 'فائض الإحتياطي / Reserve Surplus',
          balance: reserveGeneral
        },
        '1111': {
          name: 'احتياطيات لتغطية النفقات غير المتوقعة / Unexpected Expenses Reserve',
          balance: reserveUnexpected
        },
        '1112': {
          name: 'احتياطيات للنفقات المقررة على المدى الطويل / Long-term Scheduled Expenses Reserve',
          balance: reserveLongTerm
        }
      },
      total: reserveGeneral + reserveUnexpected + reserveLongTerm,
      fiscalYear
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/accounting/moroccan/loans
 * Get all loans with amortization schedules
 */
export const getLoans = async (req, res) => {
  try {
    const { residenceId } = req.query;
    
    const query = {};
    if (residenceId) {
      query.residence_id = residenceId;
    }
    
    const loans = await Loan.find(query)
      .sort({ disbursementDate: -1 });
    
    const summary = {
      active: loans.filter(l => l.status === 'active').length,
      paidOff: loans.filter(l => l.status === 'paid_off').length,
      totalPrincipal: loans.reduce((sum, l) => sum + l.principalAmount, 0),
      totalRemaining: loans.reduce((sum, l) => sum + (l.remainingBalance || 0), 0)
    };
    
    res.json({
      loans,
      summary
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/accounting/moroccan/loans
 * Create new loan with amortization schedule
 */
export const createLoan = async (req, res) => {
  try {
    const {
      residenceId,
      loanNumber,
      lender,
      principalAmount,
      interestRate,
      termMonths,
      disbursementDate,
      firstPaymentDate,
      paymentFrequency,
      purpose
    } = req.body;
    
    if (!residenceId || !loanNumber || !lender || !principalAmount || !interestRate || !termMonths) {
      return res.status(400).json({ error: 'Missing required loan fields' });
    }
    
    const loan = new Loan({
      residence_id: residenceId,
      loanNumber,
      lender,
      principalAmount,
      interestRate,
      termMonths,
      disbursementDate: new Date(disbursementDate),
      firstPaymentDate: new Date(firstPaymentDate),
      paymentFrequency: paymentFrequency || 'monthly',
      purpose
    });
    
    // Generate amortization schedule
    loan.generateAmortizationSchedule();
    
    await loan.save();
    
    res.json({
      success: true,
      loan
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/accounting/moroccan/owner-contributions
 * Get individual owner contribution tracking
 */
export const getOwnerContributions = async (req, res) => {
  try {
    const { residenceId, year, status } = req.query;
    
    const fiscalYear = year ? parseInt(year) : new Date().getFullYear();
    
    // Query contributions
    const query = { year: fiscalYear };
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const contributions = await Contribution.find(query)
      .populate('unit')
      .populate('owner')
      .sort({ status: 1, unit: 1 });
    
    // Group by status
    const byStatus = {
      paid: [],
      partial: [],
      unpaid: []
    };
    
    contributions.forEach(contrib => {
      if (byStatus[contrib.status]) {
        byStatus[contrib.status].push(contrib);
      }
    });
    
    // Calculate totals
    const totalDue = contributions.reduce((sum, c) => sum + (c.dueAmount || 0), 0);
    const totalPaid = contributions.reduce((sum, c) => sum + (c.paidAmount || 0), 0);
    const totalRemaining = contributions.reduce((sum, c) => sum + (c.remaining || 0), 0);
    
    res.json({
      contributions,
      byStatus,
      summary: {
        totalOwners: contributions.length,
        totalDue,
        totalPaid,
        totalRemaining,
        paidCount: byStatus.paid.length,
        partialCount: byStatus.partial.length,
        unpaidCount: byStatus.unpaid.length
      },
      fiscalYear
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
/**
 * POST /api/accounting/moroccan/owner-contributions
 * Create a new owner contribution (based on Law 18.00 Article 35-36)
 */
export const createOwnerContribution = async (req, res) => {
  try {
    const { owner, unit, year, dueAmount, generalAssemblyRef } = req.body;
    
    if (!owner || !unit || !year || !dueAmount) {
      return res.status(400).json({ error: 'Missing required fields: owner, unit, year, dueAmount' });
    }

    // Check if contribution already exists for this owner/unit/year
    const existing = await Contribution.findOne({ owner, unit, year });
    if (existing) {
      return res.status(400).json({ error: 'Contribution already exists for this owner/unit/year combination' });
    }

    // Create contribution
    const contribution = new Contribution({
      owner,
      unit,
      year: parseInt(year),
      dueAmount: parseFloat(dueAmount),
      paidAmount: 0,
      remaining: parseFloat(dueAmount),
      status: 'unpaid',
      generalAssemblyRef: generalAssemblyRef || `AG-${year}-001`
    });

    await contribution.save();

    // Populate owner and unit details
    await contribution.populate('owner unit');

    res.status(201).json({
      success: true,
      contribution
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/accounting/moroccan/bulk-contributions
 * Create contributions for all units in a building (Law 18.00 Articles 35, 37, 38)
 */
export const createBulkContributions = async (req, res) => {
  try {
    const { buildingId, contributionType, year, totalAmount, generalAssemblyRef } = req.body;
    
    if (!buildingId || !contributionType || !year || !totalAmount) {
      return res.status(400).json({ error: 'Missing required fields: buildingId, contributionType, year, totalAmount' });
    }

    // Validate contribution type
    const validTypes = ['regular', 'special', 'advance'];
    if (!validTypes.includes(contributionType)) {
      return res.status(400).json({ error: 'Invalid contribution type. Must be: regular, special, or advance' });
    }

    // Get all apartments in this building with their ownership percentages
    const apartments = await Apartment.find({ 
      building: buildingId,
      representativeUser: { $exists: true, $ne: null }
    }).populate('representativeUser');

    if (apartments.length === 0) {
      return res.status(404).json({ error: 'No apartments found in this building with representative users' });
    }

    // Calculate total percentage
    const totalPercentage = apartments.reduce((sum, apt) => sum + (apt.percentage_of_apartment || 0), 0);

    if (totalPercentage === 0) {
      return res.status(400).json({ error: 'Apartments do not have ownership percentages defined' });
    }

    // Create contributions for each apartment
    const contributions = [];
    const errors = [];

    for (const apartment of apartments) {
      try {
        // Calculate this apartment's share based on ownership percentage
        const percentage = apartment.percentage_of_apartment || 0;
        const individualAmount = (totalAmount * percentage) / totalPercentage;

        // Check if contribution already exists
        const existing = await Contribution.findOne({
          owner: apartment.representativeUser._id,
          unit: apartment._id,
          year: parseInt(year),
          contributionType
        });

        if (existing) {
          errors.push(`Contribution already exists for unit ${apartment.unit_code}`);
          continue;
        }

        // Create contribution
        const contribution = new Contribution({
          owner: apartment.representativeUser._id,
          unit: apartment._id,
          year: parseInt(year),
          contributionType,
          dueAmount: Math.round(individualAmount * 100) / 100, // Round to 2 decimals
          paidAmount: 0,
          remaining: Math.round(individualAmount * 100) / 100,
          status: 'unpaid',
          generalAssemblyRef: generalAssemblyRef || `AG-${year}-${contributionType.toUpperCase().substring(0,3)}`
        });

        await contribution.save();
        contributions.push(contribution);
      } catch (error) {
        errors.push(`Error for unit ${apartment.unit_code}: ${error.message}`);
      }
    }

    res.status(201).json({
      success: true,
      count: contributions.length,
      contributions,
      totalAmount: parseFloat(totalAmount),
      buildingId,
      contributionType,
      year,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};