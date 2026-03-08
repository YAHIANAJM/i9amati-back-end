import mongoose from 'mongoose';

// Track completion status of legal annexes
const annexSchema = new mongoose.Schema(
  {
    residence_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Building',
      required: true,
    },
    fiscalYear: {
      type: Number,
      required: true,
    },
    annexNumber: {
      type: String,
      required: true,
      enum: [
        'Annex 3', 'Annex 4', 'Annex 5', 'Annex 6',
        'Annex 7', 'Annex 8', 'Annex 9', 'Annex 10',
        'Annex 11', 'Annex 12', 'Annex 13', 'Annex 13-bis',
        'Annex 14'
      ],
    },
    annexName: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['complete', 'inProgress', 'missing'],
      default: 'missing',
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    generatedAt: {
      type: Date,
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Compound index for quick lookups
annexSchema.index({ residence_id: 1, fiscalYear: 1, annexNumber: 1 }, { unique: true });

// Static method to get or create annex
annexSchema.statics.getOrCreate = async function (residenceId, fiscalYear, annexNumber, annexName) {
  let annex = await this.findOne({
    residence_id: residenceId,
    fiscalYear: fiscalYear,
    annexNumber: annexNumber,
  });

  if (!annex) {
    annex = await this.create({
      residence_id: residenceId,
      fiscalYear: fiscalYear,
      annexNumber: annexNumber,
      annexName: annexName,
      status: 'missing',
      data: {},
    });
  }

  return annex;
};

const ANNEX_NAMES = {
  'Annex 3': 'Balance Sheet / الحصيلة',
  'Annex 4': 'General Management Account / حساب التسيير العام',
  'Annex 5': 'Budget Forecast / الميزانية التقديرية',
  'Annex 6': 'Off-Budget Works / الأشغال خارج الميزانية',
  'Annex 7': 'Reserve Fund / الحساب الاحتياطي',
  'Annex 8': 'Loans Tracking / تتبع القروض',
  'Annex 9': 'Equipment Inventory / تتبع المعدات',
  'Annex 10': 'Owner Contributions / إسهامات الملاك',
  'Annex 11': 'Consolidated Statements / القوائم التركيبية',
  'Annex 12': 'Budget Comparison / مقارنة الميزانية',
  'Annex 13': 'Simplified Statements / الكشف المبسط',
  'Annex 13-bis': "Owners' Shares / حصص الملاك",
  'Annex 14': "Auditor's Report / تقرير المراقب",
};

// Static method to update annex status
annexSchema.statics.updateStatus = async function (residenceId, fiscalYear, annexNumber, status, data = null) {
  const update = { status, annexName: ANNEX_NAMES[annexNumber] || annexNumber };
  
  if (data) {
    update.data = data;
    update.generatedAt = new Date();
  }

  return await this.findOneAndUpdate(
    { residence_id: residenceId, fiscalYear, annexNumber },
    { $set: update },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

// Get all annexes for a residence and year
annexSchema.statics.getAllForResidence = async function (residenceId, fiscalYear) {
  return await this.find({
    residence_id: residenceId,
    fiscalYear: fiscalYear,
  }).sort({ annexNumber: 1 });
};

export default mongoose.model('Annex', annexSchema);
