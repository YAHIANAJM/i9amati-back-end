import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const GeneralLedgerSchema = new Schema({
  residence_id: { type: Schema.Types.ObjectId, ref: 'Residence', required: false, index: true },
  accountNumber: { type: String, required: true, ref: 'Account', index: true },
  journalEntry: { type: Schema.Types.ObjectId, ref: 'JournalEntry', required: true },
  date: { type: Date, required: true, index: true },
  reference: { type: String }, // Transaction reference
  description: { type: String },
  debit: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
  balance: { type: Number, default: 0 }, // Running balance
  fiscalYear: { type: Number, required: true, index: true },
  fiscalPeriod: { type: Number, required: true }, // 1-12 for months
  isReversed: { type: Boolean, default: false }
}, { timestamps: true });

// Composite indexes for performance
GeneralLedgerSchema.index({ residence_id: 1, accountNumber: 1, date: 1 });
GeneralLedgerSchema.index({ residence_id: 1, fiscalYear: 1, fiscalPeriod: 1 });

// Static method to get account ledger with running balance
GeneralLedgerSchema.statics.getAccountLedger = async function(residenceId, accountNumber, startDate, endDate) {
  const query = {
    accountNumber: accountNumber,
    date: { $gte: startDate, $lte: endDate },
    isReversed: false
  };
  
  // Only filter by residence if provided
  if (residenceId) {
    query.residence_id = residenceId;
  }
  
  const entries = await this.find(query).sort({ date: 1, createdAt: 1 });

  let runningBalance = 0;
  return entries.map(entry => {
    runningBalance += entry.debit - entry.credit;
    return {
      ...entry.toObject(),
      runningBalance
    };
  });
};

// Static method to get account balance at specific date
GeneralLedgerSchema.statics.getAccountBalance = async function(residenceId, accountNumber, asOfDate) {
  const matchStage = {
    accountNumber: accountNumber,
    date: { $lte: asOfDate },
    isReversed: false
  };
  
  // Only filter by residence if provided
  if (residenceId) {
    matchStage.residence_id = new mongoose.Types.ObjectId(residenceId);
  }
  
  const result = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalDebit: { $sum: '$debit' },
        totalCredit: { $sum: '$credit' }
      }
    }
  ]);

  if (result.length === 0) return 0;
  
  const { totalDebit, totalCredit } = result[0];
  return totalDebit - totalCredit;
};

// Static method to get trial balance for a period
GeneralLedgerSchema.statics.getTrialBalance = async function(residenceId, fiscalYear, fiscalPeriod = null) {
  const matchStage = {
    fiscalYear: fiscalYear,
    isReversed: false
  };
  
  // Only filter by residence if provided
  if (residenceId) {
    matchStage.residence_id = new mongoose.Types.ObjectId(residenceId);
  }

  if (fiscalPeriod) {
    matchStage.fiscalPeriod = { $lte: fiscalPeriod };
  }

  const result = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$accountNumber',
        totalDebit: { $sum: '$debit' },
        totalCredit: { $sum: '$credit' }
      }
    },
    {
      $lookup: {
        from: 'accounts',
        localField: '_id',
        foreignField: 'number',
        as: 'account'
      }
    },
    { $unwind: '$account' },
    {
      $project: {
        accountNumber: '$_id',
        accountName: '$account.name',
        accountType: '$account.type',
        accountClass: '$account.class',
        debit: '$totalDebit',
        credit: '$totalCredit',
        balance: { $subtract: ['$totalDebit', '$totalCredit'] }
      }
    },
    { $sort: { accountNumber: 1 } }
  ]);

  return result;
};

const GeneralLedger = mongoose.model('GeneralLedger', GeneralLedgerSchema);
export default GeneralLedger;
