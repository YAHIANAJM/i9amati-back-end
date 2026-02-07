import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const BudgetSchema = new Schema({
  residence_id: { type: Schema.Types.ObjectId, ref: 'Residence', required: true, index: true },
  year: { type: Number, required: true, index: true },
  budgetType: { 
    type: String, 
    enum: ['actual', 'budget', 'next_budget'], // n-1 (actual), n (budget), n+1 (next_budget)
    required: true 
  },
  accountNumber: { type: String, required: true, ref: 'Account', index: true },
  amount: { type: Number, default: 0 },
  notes: { type: String },
  approvedAt: { type: Date }, // When budget was approved by general assembly
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Composite index for quick lookups
BudgetSchema.index({ residence_id: 1, year: 1, budgetType: 1, accountNumber: 1 }, { unique: true });

// Static method to get 3-year comparison
BudgetSchema.statics.getThreeYearComparison = async function(residenceId, currentYear) {
  const query = {
    year: { $in: [currentYear - 1, currentYear, currentYear + 1] }
  };
  
  // Only filter by residence if provided
  if (residenceId) {
    query.residence_id = residenceId;
  }
  
  const budgets = await this.find(query).populate('accountNumber');

  // Group by account
  const comparison = {};
  
  for (const budget of budgets) {
    if (!comparison[budget.accountNumber]) {
      comparison[budget.accountNumber] = {
        account: budget.accountNumber,
        previous: 0, // n-1
        current: 0,  // n
        next: 0      // n+1
      };
    }

    if (budget.year === currentYear - 1) {
      comparison[budget.accountNumber].previous = budget.amount;
    } else if (budget.year === currentYear) {
      comparison[budget.accountNumber].current = budget.amount;
    } else if (budget.year === currentYear + 1) {
      comparison[budget.accountNumber].next = budget.amount;
    }
  }

  return Object.values(comparison);
};

// Method to calculate variance between budget and actual
BudgetSchema.statics.getVarianceAnalysis = async function(residenceId, year) {
  const JournalLine = mongoose.model('JournalLine');
  const Account = mongoose.model('Account');

  // Get budget for this year
  const query = {
    year: year,
    budgetType: 'budget'
  };
  
  // Only filter by residence if provided
  if (residenceId) {
    query.residence_id = residenceId;
  }
  
  const budgets = await this.find(query);

  // Get actual amounts from journal lines
  const results = [];

  for (const budget of budgets) {
    const account = await Account.findOne({ number: budget.accountNumber });
    if (!account) continue;

    // Sum actuals for this account
    const actualSum = await JournalLine.aggregate([
      {
        $lookup: {
          from: 'journalentries',
          localField: 'journal_entry',
          foreignField: '_id',
          as: 'entry'
        }
      },
      { $unwind: '$entry' },
      {
        $match: {
          accountNumber: budget.accountNumber,
          'entry.date': {
            $gte: new Date(year, 0, 1),
            $lt: new Date(year + 1, 0, 1)
          }
        }
      },
      {
        $group: {
          _id: null,
          totalDebit: { $sum: '$debit' },
          totalCredit: { $sum: '$credit' }
        }
      }
    ]);

    const actual = actualSum.length > 0 
      ? (account.normalBalance === 'debit' 
          ? actualSum[0].totalDebit - actualSum[0].totalCredit
          : actualSum[0].totalCredit - actualSum[0].totalDebit)
      : 0;

    results.push({
      accountNumber: budget.accountNumber,
      accountName: account.name,
      budgeted: budget.amount,
      actual: actual,
      variance: actual - budget.amount,
      variancePercent: budget.amount !== 0 ? ((actual - budget.amount) / budget.amount * 100).toFixed(2) : 0
    });
  }

  return results;
};

const Budget = mongoose.model('Budget', BudgetSchema);
export default Budget;
