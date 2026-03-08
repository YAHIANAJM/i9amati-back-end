import mongoose from 'mongoose';

/**
 * AnnualRevenue Model
 * Tracks annual revenue calculation for residence classification
 * Based on Moroccan Law 18.00 accounting requirements
 */
const annualRevenueSchema = new mongoose.Schema({
  residence_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    required: true
  },
  
  fiscalYear: {
    type: Number,
    required: true,
    min: 2020,
    max: 2050
  },
  
  // Revenue breakdown by source (قاعدة الاستحقاق - Accrual basis)
  revenues: {
    // مساهمات العمليات الجارية - Account 7111
    currentOperations: {
      type: Number,
      default: 0,
      min: 0
    },
    
    // مساهمات الأشغال غير الجارية - Account 7112  
    specialWorks: {
      type: Number,
      default: 0,
      min: 0
    },
    
    // التسبيقات - Account 7113
    advances: {
      type: Number,
      default: 0,
      min: 0
    },
    
    // القروض المتحصلة - Account 1481
    loansReceived: {
      type: Number,
      default: 0,
      min: 0
    },
    
    // التعويضات والتأمينات - Account 7xxx
    compensations: {
      type: Number,
      default: 0,
      min: 0
    },
    
    // العائدات الأخرى المصادق عليها من الجمع العام
    otherRevenues: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  
  // Total annual revenue (sum of all sources)
  totalRevenue: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Automatic classification based on revenue level
  accountingLevel: {
    type: Number,
    enum: [1, 2, 3, 4],
    required: true
  },
  
  levelDescription: {
    type: String,
    enum: [
      'Level 1 - Simplified (< 200,000 MAD)',
      'Level 2 - Intermediate (200,000 - 500,000 MAD)',
      'Level 3 - Standard (500,000 - 1,000,000 MAD)',
      'Level 4 - Full Audit (> 1,000,000 MAD)'
    ]
  },
  
  // Required annexes based on level
  requiredAnnexes: [{
    type: String
  }],
  
  // Calculation metadata
  calculatedAt: {
    type: Date,
    default: Date.now
  },
  
  calculatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Audit trail
  notes: String,
  
  isLocked: {
    type: Boolean,
    default: false,
    comment: 'Locked after fiscal year closure'
  }
}, {
  timestamps: true
});

// Indexes
annualRevenueSchema.index({ residence_id: 1, fiscalYear: 1 }, { unique: true });
annualRevenueSchema.index({ accountingLevel: 1 });
annualRevenueSchema.index({ fiscalYear: 1 });

// Calculate total revenue before saving
// Pre-validate hook: Calculate totals and classification BEFORE validation
annualRevenueSchema.pre('validate', function(next) {
  try {
    // Initialize revenues object if not present
    if (!this.revenues) {
      this.revenues = {};
    }
    
    const revenue = this.revenues;
    
    // Ensure all revenue fields have default values
    revenue.currentOperations = revenue.currentOperations || 0;
    revenue.specialWorks = revenue.specialWorks || 0;
    revenue.advances = revenue.advances || 0;
    revenue.loansReceived = revenue.loansReceived || 0;
    revenue.compensations = revenue.compensations || 0;
    revenue.otherRevenues = revenue.otherRevenues || 0;
    
    // Calculate total
    this.totalRevenue = 
      revenue.currentOperations +
      revenue.specialWorks +
      revenue.advances +
      revenue.loansReceived +
      revenue.compensations +
      revenue.otherRevenues;
    
    console.log('Pre-validate hook - totalRevenue calculated:', this.totalRevenue);
    
    // Automatic classification
    this.accountingLevel = this.calculateLevel(this.totalRevenue);
    this.levelDescription = this.getLevelDescription(this.accountingLevel);
    this.requiredAnnexes = this.getRequiredAnnexes(this.accountingLevel);
    
    console.log('Pre-validate hook - accountingLevel set:', this.accountingLevel);
    
    next();
  } catch (error) {
    console.error('Error in AnnualRevenue pre-validate hook:', error);
    next(error);
  }
});

// Method: Calculate accounting level based on total revenue
annualRevenueSchema.methods.calculateLevel = function(totalRevenue) {
  if (totalRevenue < 200000) return 1;
  if (totalRevenue < 500000) return 2;
  if (totalRevenue < 1000000) return 3;
  return 4;
};

// Method: Get level description
annualRevenueSchema.methods.getLevelDescription = function(level) {
  const descriptions = {
    1: 'Level 1 - Simplified (< 200,000 MAD)',
    2: 'Level 2 - Intermediate (200,000 - 500,000 MAD)',
    3: 'Level 3 - Standard (500,000 - 1,000,000 MAD)',
    4: 'Level 4 - Full Audit (> 1,000,000 MAD)'
  };
  return descriptions[level];
};

// Method: Get required annexes based on level
annualRevenueSchema.methods.getRequiredAnnexes = function(level) {
  const annexesByLevel = {
    1: ['Annex 10', 'Annex 13', 'Annex 13-bis'],
    2: ['Annex 10', 'Annex 11', 'Annex 12'],
    3: ['Annex 3', 'Annex 4', 'Annex 5', 'Annex 6', 'Annex 7', 'Annex 8', 'Annex 9', 'Annex 10'],
    4: ['Annex 1', 'Annex 2', 'Annex 3', 'Annex 4', 'Annex 5', 'Annex 6', 'Annex 7', 'Annex 8', 'Annex 9', 'Annex 10', 'Annex 11', 'Annex 12', 'Annex 14']
  };
  return annexesByLevel[level] || [];
};

// Static method: Get or create annual revenue record
annualRevenueSchema.statics.getOrCreate = async function(residenceId, fiscalYear, calculatedBy) {
  let record = await this.findOne({ residence_id: residenceId, fiscalYear });
  
  if (!record) {
    record = await this.create({
      residence_id: residenceId,
      fiscalYear,
      calculatedBy,
      revenues: {}
    });
  }
  
  return record;
};

// Static method: Calculate revenue from accounting data
annualRevenueSchema.statics.calculateFromAccounting = async function(residenceId, fiscalYear) {
  const Account = mongoose.model('Account');
  const GeneralLedger = mongoose.model('GeneralLedger');
  const Contribution = mongoose.model('Contribution');
  const Loan = mongoose.model('Loan');
  
  // Convert residenceId to ObjectId if it's a string
  const residenceObjectId = typeof residenceId === 'string' 
    ? new mongoose.Types.ObjectId(residenceId) 
    : residenceId;
  
  const startDate = new Date(fiscalYear, 0, 1);
  const endDate = new Date(fiscalYear, 11, 31, 23, 59, 59);
  
  // Calculate current operations (Account 7111)
  const currentOperations = await GeneralLedger.aggregate([
    {
      $match: {
        residence_id: residenceObjectId,
        accountNumber: '7111',
        date: { $gte: startDate, $lte: endDate },
        isReversed: false
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$credit' }
      }
    }
  ]);
  
  // Calculate special works (Account 7112)
  const specialWorks = await GeneralLedger.aggregate([
    {
      $match: {
        residence_id: residenceObjectId,
        accountNumber: '7112',
        date: { $gte: startDate, $lte: endDate },
        isReversed: false
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$credit' }
      }
    }
  ]);
  
  // Calculate advances (Account 7113)
  const advances = await GeneralLedger.aggregate([
    {
      $match: {
        residence_id: residenceObjectId,
        accountNumber: '7113',
        date: { $gte: startDate, $lte: endDate },
        isReversed: false
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$credit' }
      }
    }
  ]);
  
  // Calculate loans received (Account 1481)
  const loansReceived = await Loan.aggregate([
    {
      $match: {
        residence_id: residenceObjectId,
        startDate: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$principalAmount' }
      }
    }
  ]);
  
  // Calculate other revenues (Class 7 accounts excluding above)
  const otherRevenues = await GeneralLedger.aggregate([
    {
      $match: {
        residence_id: residenceObjectId,
        $and: [
          { accountNumber: { $regex: '^7' } },
          { accountNumber: { $nin: ['7111', '7112', '7113'] } }
        ],
        date: { $gte: startDate, $lte: endDate },
        isReversed: false
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$credit' }
      }
    }
  ]);
  
  return {
    currentOperations: currentOperations[0]?.total || 0,
    specialWorks: specialWorks[0]?.total || 0,
    advances: advances[0]?.total || 0,
    loansReceived: loansReceived[0]?.total || 0,
    compensations: 0, // TODO: Add when account defined
    otherRevenues: otherRevenues[0]?.total || 0
  };
};

const AnnualRevenue = mongoose.model('AnnualRevenue', annualRevenueSchema);

export default AnnualRevenue;
