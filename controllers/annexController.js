import mongoose from 'mongoose';
import Annex from '../models/Annex.js';
import GeneralLedger from '../models/GeneralLedger.js';
import Budget from '../models/Budget.js';
import Loan from '../models/Loan.js';
import Contribution from '../models/Contribution.js';
import Payment from '../models/Payment.js';
import Apartment from '../models/Apartment.js';
import Account from '../models/Account.js';

// ============= ANNEX 3: BALANCE SHEET (الحصيلة) =============
export const generateAnnex3 = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    // Get all accounts with their balances
    const accounts = await GeneralLedger.aggregate([
      {
        $match: {
          residence_id: new mongoose.Types.ObjectId(residenceId),
          fiscalYear: fiscalYear,
        },
      },
      {
        $group: {
          _id: '$accountNumber',
          totalDebit: { $sum: '$debit' },
          totalCredit: { $sum: '$credit' },
        },
      },
      {
        $project: {
          accountCode: '$_id',
          balance: { $subtract: ['$totalDebit', '$totalCredit'] },
        },
      },
      { $sort: { accountCode: 1 } },
    ]);

    // Organize by asset, liability, equity
    const balanceSheet = {
      assets: {
        currentAssets: accounts.filter(a => a.accountCode.startsWith('3') || a.accountCode.startsWith('51')),
        fixedAssets: accounts.filter(a => a.accountCode.startsWith('2')),
        total: 0,
      },
      liabilities: {
        currentLiabilities: accounts.filter(a => a.accountCode.startsWith('44') || a.accountCode.startsWith('45')),
        longTermLiabilities: accounts.filter(a => a.accountCode.startsWith('14') || a.accountCode.startsWith('15')),
        total: 0,
      },
      equity: {
        reserves: accounts.filter(a => a.accountCode.startsWith('11')),
        surplus: accounts.filter(a => a.accountCode.startsWith('12')),
        total: 0,
      },
    };

    // Calculate totals
    balanceSheet.assets.total = balanceSheet.assets.currentAssets.reduce((sum, a) => sum + Math.abs(a.balance), 0) +
                                 balanceSheet.assets.fixedAssets.reduce((sum, a) => sum + Math.abs(a.balance), 0);
    
    balanceSheet.liabilities.total = balanceSheet.liabilities.currentLiabilities.reduce((sum, a) => sum + Math.abs(a.balance), 0) +
                                     balanceSheet.liabilities.longTermLiabilities.reduce((sum, a) => sum + Math.abs(a.balance), 0);
    
    balanceSheet.equity.total = balanceSheet.equity.reserves.reduce((sum, a) => sum + Math.abs(a.balance), 0) +
                               balanceSheet.equity.surplus.reduce((sum, a) => sum + Math.abs(a.balance), 0);

    // Save annex
    await Annex.updateStatus(residenceId, fiscalYear, 'Annex 3', 'complete', balanceSheet);

    res.json({
      success: true,
      annexNumber: 'Annex 3',
      annexName: 'Balance Sheet / الحصيلة',
      data: balanceSheet,
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error generating Annex 3:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============= ANNEX 4: GENERAL MANAGEMENT ACCOUNT (حساب التسيير العام) =============
export const generateAnnex4 = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    // Get revenues (Class 7)
    const revenues = await GeneralLedger.aggregate([
      {
        $match: {
          residence_id: new mongoose.Types.ObjectId(residenceId),
          fiscalYear: fiscalYear,
          accountNumber: { $regex: '^7' },
        },
      },
      {
        $group: {
          _id: '$accountNumber',
          total: { $sum: '$credit' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Get expenses (Class 6)
    const expenses = await GeneralLedger.aggregate([
      {
        $match: {
          residence_id: new mongoose.Types.ObjectId(residenceId),
          fiscalYear: fiscalYear,
          accountNumber: { $regex: '^6' },
        },
      },
      {
        $group: {
          _id: '$accountNumber',
          total: { $sum: '$debit' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const totalRevenues = revenues.reduce((sum, r) => sum + r.total, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.total, 0);
    const netResult = totalRevenues - totalExpenses;

    const managementAccount = {
      revenues,
      totalRevenues,
      expenses,
      totalExpenses,
      netResult,
      resultType: netResult >= 0 ? 'surplus' : 'deficit',
    };

    await Annex.updateStatus(residenceId, fiscalYear, 'Annex 4', 'complete', managementAccount);

    res.json({
      success: true,
      annexNumber: 'Annex 4',
      annexName: 'General Management Account / حساب التسيير العام',
      data: managementAccount,
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error generating Annex 4:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============= ANNEX 5: BUDGET FORECAST (الميزانية التقديرية) =============
export const generateAnnex5 = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    const budgetItems = await Budget.find({
      residence_id: residenceId,
      year: fiscalYear,
      budgetType: 'budget',
    });

    if (!budgetItems.length) {
      return res.status(404).json({ error: 'Budget not found for this year' });
    }

    const revenueItems = budgetItems.filter(b => b.accountNumber?.startsWith('7'));
    const expenseItems = budgetItems.filter(b => b.accountNumber?.startsWith('6'));
    const totalRevenuesForecasted = revenueItems.reduce((sum, b) => sum + b.amount, 0);
    const totalExpensesForecasted = expenseItems.reduce((sum, b) => sum + b.amount, 0);

    const budgetData = {
      revenuesForecasted: revenueItems.map(b => ({ accountNumber: b.accountNumber, amount: b.amount })),
      totalRevenuesForecasted,
      expensesForecasted: expenseItems.map(b => ({ accountNumber: b.accountNumber, amount: b.amount })),
      totalExpensesForecasted,
      forecastedResult: totalRevenuesForecasted - totalExpensesForecasted,
      approvedAt: budgetItems[0]?.approvedAt,
    };

    await Annex.updateStatus(residenceId, fiscalYear, 'Annex 5', 'complete', budgetData);

    res.json({
      success: true,
      annexNumber: 'Annex 5',
      annexName: 'Budget Forecast / الميزانية التقديرية',
      data: budgetData,
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error generating Annex 5:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============= ANNEX 7: RESERVE FUND TRACKING (تتبع الحساب الاحتياطي) =============
export const generateAnnex7 = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    // Get reserve fund movements (Account 1140)
    const reserveMovements = await GeneralLedger.find({
      residence_id: residenceId,
      fiscalYear: fiscalYear,
      accountNumber: { $in: ['1140', '1141', '1142'] }, // Various reserve accounts
    }).sort({ date: 1 });

    let runningBalance = 0;
    const movements = reserveMovements.map(m => {
      runningBalance += m.debit - m.credit;
      return {
        date: m.date,
        description: m.description,
        debit: m.debit,
        credit: m.credit,
        balance: runningBalance,
      };
    });

    const reserveData = {
      openingBalance: movements.length > 0 ? movements[0].balance - movements[0].debit + movements[0].credit : 0,
      movements,
      closingBalance: runningBalance,
      totalContributions: reserveMovements.reduce((sum, m) => sum + m.debit, 0),
      totalWithdrawals: reserveMovements.reduce((sum, m) => sum + m.credit, 0),
    };

    await Annex.updateStatus(residenceId, fiscalYear, 'Annex 7', 'complete', reserveData);

    res.json({
      success: true,
      annexNumber: 'Annex 7',
      annexName: 'Reserve Fund Tracking / تتبع الحساب الاحتياطي',
      data: reserveData,
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error generating Annex 7:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============= ANNEX 8: LOANS TRACKING (تتبع القروض) =============
export const generateAnnex8 = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    const loans = await Loan.find({
      residence_id: residenceId,
      disbursementDate: { $lte: new Date(`${fiscalYear}-12-31`) },
      status: { $ne: 'paid_off' },
    });

    const loansData = loans.map(loan => {
      const paid = loan.amortizationSchedule?.filter(p => p.isPaid).reduce((s, p) => s + p.principal, 0) || 0;
      const remaining = loan.principalAmount - paid;
      return {
        loanId: loan._id,
        loanNumber: loan.loanNumber,
        lender: loan.lender,
        principalAmount: loan.principalAmount,
        interestRate: loan.interestRate,
        disbursementDate: loan.disbursementDate,
        termMonths: loan.termMonths,
        remainingBalance: remaining,
        status: loan.status,
      };
    });

    const summary = {
      totalLoans: loans.length,
      totalBorrowed: loans.reduce((sum, l) => sum + l.principalAmount, 0),
      totalRemaining: loansData.reduce((sum, l) => sum + l.remainingBalance, 0),
      totalPaid: loansData.reduce((sum, l) => sum + (l.principalAmount - l.remainingBalance), 0),
    };

    await Annex.updateStatus(residenceId, fiscalYear, 'Annex 8', 'complete', { loans: loansData, summary });

    res.json({
      success: true,
      annexNumber: 'Annex 8',
      annexName: 'Loans Tracking / تتبع القروض',
      data: { loans: loansData, summary },
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error generating Annex 8:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============= ANNEX 10: OWNER CONTRIBUTIONS TRACKING (تتبع إسهامات المالك) =============
export const generateAnnex10 = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    const apartments = await Apartment.find({ building: residenceId }).populate('representativeUser', 'name email');

    const contributionsData = await Promise.all(
      apartments.map(async (apt) => {
        const contributions = await Contribution.find({
          apartment_id: apt._id,
          year: fiscalYear,
        });

        const payments = await Payment.find({
          apartment_id: apt._id,
          year: fiscalYear,
        });

        const totalDue = contributions.reduce((sum, c) => sum + c.amount, 0);
        const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
        const balance = totalDue - totalPaid;

        const primaryOwner = apt.owners?.[0];
        const ownerName = apt.representativeUser?.name ||
          (primaryOwner ? `${primaryOwner.firstName} ${primaryOwner.lastName}` : 'N/A');
        const ownerEmail = apt.representativeUser?.email || primaryOwner?.email || 'N/A';

        return {
          apartmentNumber: apt.unit_code || apt.main_plot_number || String(apt._id),
          ownerName,
          ownerEmail,
          share: apt.share || 0,
          totalDue,
          totalPaid,
          balance,
          status: balance === 0 ? 'paid' : balance > 0 ? 'pending' : 'overpaid',
        };
      })
    );

    const summary = {
      totalApartments: apartments.length,
      totalDue: contributionsData.reduce((sum, c) => sum + c.totalDue, 0),
      totalCollected: contributionsData.reduce((sum, c) => sum + c.totalPaid, 0),
      totalOutstanding: contributionsData.reduce((sum, c) => sum + Math.max(c.balance, 0), 0),
      collectionRate: 0,
    };

    summary.collectionRate = summary.totalDue > 0 ? (summary.totalCollected / summary.totalDue) * 100 : 0;

    await Annex.updateStatus(residenceId, fiscalYear, 'Annex 10', 'complete', { contributions: contributionsData, summary });

    res.json({
      success: true,
      annexNumber: 'Annex 10',
      annexName: 'Owner Contributions Tracking / تتبع إسهامات المالك',
      data: { contributions: contributionsData, summary },
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error generating Annex 10:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============= ANNEX 6: OFF-BUDGET WORKS TRACKING (تتبع الأشغال خارج الميزانية) =============
// Level 3, 4 - Tracks extraordinary works not included in regular budget
export const generateAnnex6 = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    // Get special works transactions (Account 7112 for revenue, 61xx for expenses)
    const specialWorks = await GeneralLedger.aggregate([
      {
        $match: {
          residence_id: new mongoose.Types.ObjectId(residenceId),
          fiscalYear: fiscalYear,
          $or: [
            { accountNumber: '7112' }, // Special works contributions
            { accountNumber: { $regex: '^61[2-9]' } }, // Special works expenses
          ],
        },
      },
      {
        $group: {
          _id: {
            accountCode: '$accountNumber',
            description: '$description',
          },
          totalDebit: { $sum: '$debit' },
          totalCredit: { $sum: '$credit' },
          entries: { $push: { date: '$date', reference: '$reference', amount: { $subtract: ['$debit', '$credit'] } } },
        },
      },
      {
        $project: {
          accountCode: '$_id.accountCode',
          description: '$_id.description',
          contributions: '$totalCredit',
          expenses: '$totalDebit',
          balance: { $subtract: ['$totalCredit', '$totalDebit'] },
          entries: 1,
        },
      },
      { $sort: { accountCode: 1 } },
    ]);

    const summary = {
      totalContributions: specialWorks.reduce((sum, w) => sum + w.contributions, 0),
      totalExpenses: specialWorks.reduce((sum, w) => sum + w.expenses, 0),
      netBalance: 0,
      totalWorks: specialWorks.length,
    };

    summary.netBalance = summary.totalContributions - summary.totalExpenses;

    const annexData = {
      works: specialWorks,
      summary,
    };

    await Annex.updateStatus(residenceId, fiscalYear, 'Annex 6', 'complete', annexData);

    res.json({
      success: true,
      annexNumber: 'Annex 6',
      annexName: 'Off-Budget Works Tracking / تتبع الأشغال خارج الميزانية',
      data: annexData,
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error generating Annex 6:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============= ANNEX 9: EQUIPMENT & BUILDING INVENTORY (تتبع المعدات والتجهيزات) =============
// Level 3, 4 - Fixed assets inventory and depreciation tracking
export const generateAnnex9 = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    // Get fixed assets (Class 2 accounts)
    const equipment = await GeneralLedger.aggregate([
      {
        $match: {
          residence_id: new mongoose.Types.ObjectId(residenceId),
          fiscalYear: { $lte: fiscalYear },
          accountNumber: { $regex: '^2' },
        },
      },
      {
        $group: {
          _id: '$accountNumber',
          acquisitionValue: { $sum: '$debit' },
          disposals: { $sum: '$credit' },
        },
      },
      {
        $project: {
          accountCode: '$_id',
          acquisitionValue: 1,
          disposals: 1,
          netValue: { $subtract: ['$acquisitionValue', '$disposals'] },
        },
      },
      { $sort: { accountCode: 1 } },
    ]);

    // Calculate depreciation (Account 2839)
    const depreciation = await GeneralLedger.aggregate([
      {
        $match: {
          residence_id: new mongoose.Types.ObjectId(residenceId),
          fiscalYear: { $lte: fiscalYear },
          accountNumber: { $regex: '^2839' },
        },
      },
      {
        $group: {
          _id: null,
          totalDepreciation: { $sum: '$credit' },
        },
      },
    ]);

    const totalDepreciation = depreciation[0]?.totalDepreciation || 0;

    const inventory = equipment.map(item => ({
      ...item,
      depreciationRate: item.accountCode.startsWith('22') ? 0.05 : // Buildings - 5%
                       item.accountCode.startsWith('23') ? 0.10 : // Equipment - 10%
                       item.accountCode.startsWith('24') ? 0.20 : // Furniture - 20%
                       0.15, // Others - 15%
      estimatedDepreciation: item.netValue * (item.accountCode.startsWith('22') ? 0.05 :
                                             item.accountCode.startsWith('23') ? 0.10 :
                                             item.accountCode.startsWith('24') ? 0.20 : 0.15),
    }));

    const summary = {
      totalItems: equipment.length,
      totalAcquisitionValue: equipment.reduce((sum, e) => sum + e.acquisitionValue, 0),
      totalDepreciation: totalDepreciation,
      netBookValue: equipment.reduce((sum, e) => sum + e.netValue, 0) - totalDepreciation,
    };

    const annexData = {
      inventory,
      summary,
    };

    await Annex.updateStatus(residenceId, fiscalYear, 'Annex 9', 'complete', annexData);

    res.json({
      success: true,
      annexNumber: 'Annex 9',
      annexName: 'Equipment & Building Inventory / تتبع المعدات والتجهيزات',
      data: annexData,
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error generating Annex 9:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============= ANNEX 11: SIMPLIFIED CONSOLIDATED STATEMENTS (القوائم التركيبية المبسطة) =============
// Level 2, 4 - Summarized financial overview for medium-sized buildings
export const generateAnnex11 = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    // Get summary by account class
    const accountSummary = await GeneralLedger.aggregate([
      {
        $match: {
          residence_id: new mongoose.Types.ObjectId(residenceId),
          fiscalYear: fiscalYear,
        },
      },
      {
        $addFields: {
          accountClass: { $substr: ['$accountNumber', 0, 1] },
        },
      },
      {
        $group: {
          _id: '$accountClass',
          totalDebit: { $sum: '$debit' },
          totalCredit: { $sum: '$credit' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const getClassName = (classNum) => {
      const names = {
        '1': 'Equity / الأموال الخاصة',
        '2': 'Fixed Assets / الأصول الثابتة',
        '3': 'Current Assets / الأصول المتداولة',
        '4': 'Liabilities / الخصوم',
        '5': 'Treasury / الخزينة',
        '6': 'Expenses / المصروفات',
        '7': 'Revenues / العائدات',
      };
      return names[classNum] || 'Other / أخرى';
    };

    const consolidatedData = accountSummary.map(item => ({
      accountClass: item._id,
      className: getClassName(item._id),
      totalDebit: item.totalDebit,
      totalCredit: item.totalCredit,
      balance: item.totalDebit - item.totalCredit,
    }));

    // Calculate key metrics
    const revenues = consolidatedData.find(item => item.accountClass === '7')?.totalCredit || 0;
    const expenses = consolidatedData.find(item => item.accountClass === '6')?.totalDebit || 0;
    const assets = consolidatedData
      .filter(item => ['2', '3', '5'].includes(item.accountClass))
      .reduce((sum, item) => sum + Math.abs(item.balance), 0);
    const liabilities = consolidatedData
      .filter(item => ['1', '4'].includes(item.accountClass))
      .reduce((sum, item) => sum + Math.abs(item.balance), 0);

    const summary = {
      totalRevenues: revenues,
      totalExpenses: expenses,
      netResult: revenues - expenses,
      totalAssets: assets,
      totalLiabilities: liabilities,
      netWorth: assets - liabilities,
    };

    const annexData = {
      consolidatedAccounts: consolidatedData,
      summary,
    };

    await Annex.updateStatus(residenceId, fiscalYear, 'Annex 11', 'complete', annexData);

    res.json({
      success: true,
      annexNumber: 'Annex 11',
      annexName: 'Simplified Consolidated Statements / القوائم التركيبية المبسطة',
      data: annexData,
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error generating Annex 11:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============= ANNEX 12: BUDGET COMPARISON & VARIANCE ANALYSIS (بيانات المقارنة والتحليل) =============
// Level 2, 4 - Actual vs Budget comparison with variance analysis
export const generateAnnex12 = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    // Get budget data
    const budgets = await Budget.find({
      residence_id: residenceId,
      year: fiscalYear,
    });

    // Get actual data by account
    const actuals = await GeneralLedger.aggregate([
      {
        $match: {
          residence_id: new mongoose.Types.ObjectId(residenceId),
          fiscalYear: fiscalYear,
        },
      },
      {
        $group: {
          _id: '$accountNumber',
          actualDebit: { $sum: '$debit' },
          actualCredit: { $sum: '$credit' },
        },
      },
    ]);

    // Match budgets with actuals
    const comparison = budgets.map(budget => {
      const actual = actuals.find(a => a._id === budget.accountNumber);
      const isRevenue = budget.accountNumber?.startsWith('7');
      const actualAmount = isRevenue ? (actual?.actualCredit || 0) : (actual?.actualDebit || 0);
      const budgetedAmount = budget.amount;
      
      const variance = actualAmount - budgetedAmount;
      const variancePercent = budgetedAmount > 0 
        ? (variance / budgetedAmount) * 100 
        : 0;

      return {
        accountNumber: budget.accountNumber,
        type: isRevenue ? 'revenue' : 'expense',
        budgetedAmount,
        actualAmount,
        variance,
        variancePercent,
        status: Math.abs(variancePercent) > 10 ? 'significant' : 
               Math.abs(variancePercent) > 5 ? 'moderate' : 'ontrack',
      };
    });

    const filterType = (t) => comparison.filter(c => c.type === t);
    const summary = {
      totalBudgetedRevenue: filterType('revenue').reduce((sum, c) => sum + c.budgetedAmount, 0),
      totalActualRevenue: filterType('revenue').reduce((sum, c) => sum + c.actualAmount, 0),
      totalBudgetedExpense: filterType('expense').reduce((sum, c) => sum + c.budgetedAmount, 0),
      totalActualExpense: filterType('expense').reduce((sum, c) => sum + c.actualAmount, 0),
      revenueVariance: 0,
      expenseVariance: 0,
      budgetedNetResult: 0,
      actualNetResult: 0,
    };

    summary.revenueVariance = summary.totalActualRevenue - summary.totalBudgetedRevenue;
    summary.expenseVariance = summary.totalActualExpense - summary.totalBudgetedExpense;
    summary.budgetedNetResult = summary.totalBudgetedRevenue - summary.totalBudgetedExpense;
    summary.actualNetResult = summary.totalActualRevenue - summary.totalActualExpense;

    const annexData = {
      comparison,
      summary,
    };

    await Annex.updateStatus(residenceId, fiscalYear, 'Annex 12', 'complete', annexData);

    res.json({
      success: true,
      annexNumber: 'Annex 12',
      annexName: 'Budget Comparison & Variance Analysis / بيانات المقارنة والتحليل',
      data: annexData,
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error generating Annex 12:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============= ANNEX 13: SIMPLIFIED RECEIPTS & EXPENSES (كشف التحصيلات والمصروفات المبسط) =============
// Level 1 - For buildings with annual revenue < 200,000 MAD
export const generateAnnex13 = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    // Get all receipts (Credits in Class 7)
    const receipts = await GeneralLedger.aggregate([
      {
        $match: {
          residence_id: new mongoose.Types.ObjectId(residenceId),
          fiscalYear: fiscalYear,
          accountNumber: { $regex: '^7' },
        },
      },
      {
        $group: {
          _id: '$accountNumber',
          total: { $sum: '$credit' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Get all expenses (Debits in Class 6)
    const expenses = await GeneralLedger.aggregate([
      {
        $match: {
          residence_id: new mongoose.Types.ObjectId(residenceId),
          fiscalYear: fiscalYear,
          accountNumber: { $regex: '^6' },
        },
      },
      {
        $group: {
          _id: '$accountNumber',
          total: { $sum: '$debit' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const totalReceipts = receipts.reduce((sum, r) => sum + r.total, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.total, 0);
    const netBalance = totalReceipts - totalExpenses;

    const annexData = {
      receipts,
      totalReceipts,
      expenses,
      totalExpenses,
      netBalance,
      balanceType: netBalance >= 0 ? 'surplus' : 'deficit',
    };

    await Annex.updateStatus(residenceId, fiscalYear, 'Annex 13', 'complete', annexData);

    res.json({
      success: true,
      anniversNumber: 'Annex 13',
      annexName: 'Simplified Receipts & Expenses Statement / كشف التحصيلات والمصروفات المبسط',
      data: annexData,
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error generating Annex 13:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============= ANNEX 13-BIS: OWNERS' SHARES STATEMENT (كشف حصص الملاك) =============
// Level 1 - Detailed breakdown of owners' contributions and shares
export const generateAnnex13bis = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    const apartments = await Apartment.find({ building: residenceId }).populate('representativeUser', 'name email phone');

    const ownersData = await Promise.all(
      apartments.map(async (apt) => {
        const contributions = await Contribution.find({
          apartment_id: apt._id,
          year: fiscalYear,
        });

        const payments = await Payment.find({
          apartment_id: apt._id,
          year: fiscalYear,
        });

        const totalContributions = contributions.reduce((sum, c) => sum + c.amount, 0);
        const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
        const balance = totalContributions - totalPaid;

        const primaryOwner = apt.owners?.[0];
        const ownerName = apt.representativeUser?.name ||
          (primaryOwner ? `${primaryOwner.firstName} ${primaryOwner.lastName}` : 'Unknown');
        const ownerEmail = apt.representativeUser?.email || primaryOwner?.email || 'N/A';
        const ownerPhone = apt.representativeUser?.phone || primaryOwner?.phone || 'N/A';

        return {
          apartmentNumber: apt.unit_code || apt.main_plot_number || String(apt._id),
          ownerName,
          ownerEmail,
          ownerPhone,
          share: apt.share || 0,
          sharePercentage: apt.sharePercentage || 0,
          contributionsDue: totalContributions,
          paidAmount: totalPaid,
          outstandingBalance: Math.max(balance, 0),
          overpayment: Math.abs(Math.min(balance, 0)),
        };
      })
    );

    const summary = {
      totalApartments: apartments.length,
      totalShares: ownersData.reduce((sum, o) => sum + o.share, 0),
      totalContributionsDue: ownersData.reduce((sum, o) => sum + o.contributionsDue, 0),
      totalPaid: ownersData.reduce((sum, o) => sum + o.paidAmount, 0),
      totalOutstanding: ownersData.reduce((sum, o) => sum + o.outstandingBalance, 0),
      collectionRate: 0,
    };

    summary.collectionRate = summary.totalContributionsDue > 0
      ? (summary.totalPaid / summary.totalContributionsDue) * 100
      : 0;

    const annexData = {
      owners: ownersData,
      summary,
    };

    await Annex.updateStatus(residenceId, fiscalYear, 'Annex 13-bis', 'complete', annexData);

    res.json({
      success: true,
      annexNumber: 'Annex 13-bis',
      annexName: "Owners' Shares Statement / كشف حصص الملاك",
      data: annexData,
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error generating Annex 13-bis:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============= ANNEX 14: EXTERNAL AUDITOR'S REPORT (تقرير مراقب الحسابات الخارجي) =============
// Level 4 - Certified accountant's audit report (required for annual revenue >= 2M MAD)
export const generateAnnex14 = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    // Get financial summary data for the report
    const revenues = await GeneralLedger.aggregate([
      {
        $match: {
          residence_id: new mongoose.Types.ObjectId(residenceId),
          fiscalYear: fiscalYear,
          accountNumber: { $regex: '^7' },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$credit' },
        },
      },
    ]);

    const expenses = await GeneralLedger.aggregate([
      {
        $match: {
          residence_id: new mongoose.Types.ObjectId(residenceId),
          fiscalYear: fiscalYear,
          accountNumber: { $regex: '^6' },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$debit' },
        },
      },
    ]);

    const totalRevenue = revenues[0]?.total || 0;
    const totalExpenses = expenses[0]?.total || 0;

    // Annex 14 is a placeholder for the external auditor's certification
    // In practice, this would be filled by the certified accountant
    const annexData = {
      auditStatus: 'pending_certification',
      financialYear: fiscalYear,
      totalRevenue,
      totalExpenses,
      netResult: totalRevenue - totalExpenses,
      auditDate: null,
      auditorName: null,
      auditorLicenseNumber: null,
      auditorOpinion: null, // 'unqualified', 'qualified', 'adverse', 'disclaimer'
      notes: 'This annex requires certification by an external certified accountant as per Law 18.00',
      certificationRequirements: [
        'External auditor must be registered with OEC (Ordre des Experts-Comptables)',
        'Audit must comply with Moroccan accounting standards',
        'Report must include opinion on financial statements accuracy',
        'Must verify compliance with Law 18.00 requirements',
      ],
    };

    await Annex.updateStatus(residenceId, fiscalYear, 'Annex 14', 'pending', annexData);

    res.json({
      success: true,
      annexNumber: 'Annex 14',
      annexName: "External Auditor's Report / تقرير مراقب الحسابات الخارجي",
      data: annexData,
      generatedAt: new Date(),
      warning: 'This annex requires external auditor certification before submission',
    });
  } catch (error) {
    console.error('Error generating Annex 14:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============= GET ANNEX STATUS =============
export const getAnnexStatus = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    const annexes = await Annex.getAllForResidence(residenceId, fiscalYear);

    res.json({
      success: true,
      residenceId,
      fiscalYear,
      annexes,
    });
  } catch (error) {
    console.error('Error getting annex status:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============= GET SINGLE ANNEX =============
export const getAnnex = async (req, res) => {
  try {
    const { residenceId, year, annexNumber } = req.params;
    const fiscalYear = parseInt(year);

    const annex = await Annex.findOne({
      residence_id: residenceId,
      fiscalYear: fiscalYear,
      annexNumber: annexNumber,
    });

    if (!annex) {
      return res.status(404).json({ error: 'Annex not found' });
    }

    res.json({
      success: true,
      annex,
    });
  } catch (error) {
    console.error('Error getting annex:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============= GENERATE ALL REQUIRED ANNEXES FOR LEVEL =============
export const generateAllAnnexesForLevel = async (req, res) => {
  try {
    const { residenceId, year, level } = req.params;
    const fiscalYear = parseInt(year);

    const annexMap = {
      1: ['Annex 10', 'Annex 13', 'Annex 13-bis'],
      2: ['Annex 10', 'Annex 11', 'Annex 12'],
      3: ['Annex 3', 'Annex 4', 'Annex 5', 'Annex 6', 'Annex 7', 'Annex 8', 'Annex 9', 'Annex 10'],
      4: ['Annex 3', 'Annex 4', 'Annex 5', 'Annex 6', 'Annex 7', 'Annex 8', 'Annex 9', 'Annex 10', 'Annex 11', 'Annex 12', 'Annex 14'],
    };

    const handlerMap = {
      'Annex 3': generateAnnex3,
      'Annex 4': generateAnnex4,
      'Annex 5': generateAnnex5,
      'Annex 6': generateAnnex6,
      'Annex 7': generateAnnex7,
      'Annex 8': generateAnnex8,
      'Annex 9': generateAnnex9,
      'Annex 10': generateAnnex10,
      'Annex 11': generateAnnex11,
      'Annex 12': generateAnnex12,
      'Annex 13': generateAnnex13,
      'Annex 13-bis': generateAnnex13bis,
      'Annex 14': generateAnnex14,
    };

    const requiredAnnexes = annexMap[parseInt(level)] || [];
    const mockReq = { params: { residenceId, year: year.toString() } };
    const results = [];

    for (const annexNum of requiredAnnexes) {
      const handler = handlerMap[annexNum];
      if (!handler) {
        results.push({ annexNumber: annexNum, status: 'skipped' });
        continue;
      }
      try {
        await new Promise((resolve, reject) => {
          const mockRes = {
            json: (data) => resolve(data),
            status: () => ({ json: (err) => reject(new Error(err?.error || 'Failed')) }),
          };
          handler(mockReq, mockRes);
        });
        results.push({ annexNumber: annexNum, status: 'generated' });
      } catch (error) {
        results.push({ annexNumber: annexNum, status: 'failed', error: error.message });
      }
    }

    res.json({
      success: true,
      level,
      results,
    });
  } catch (error) {
    console.error('Error generating all annexes:', error);
    res.status(500).json({ error: error.message });
  }
};
