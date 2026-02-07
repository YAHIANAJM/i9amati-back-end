import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const AccountSchema = new Schema({
  number: { type: String, required: true, unique: true, index: true }, // e.g. 3421, 7111
  name: { type: String, required: true }, // Arabic/bilingual name
  type: { 
    type: String, 
    enum: ['asset', 'liability', 'revenue', 'expense', 'treasury', 'equity'], 
    required: true 
  },
  class: { 
    type: Number, 
    enum: [1, 2, 3, 4, 5, 6, 7], // Moroccan decree classes
    required: true 
  },
  normalBalance: {
    type: String,
    enum: ['debit', 'credit'],
    default: function() {
      // Assets, Expenses have debit normal balance
      // Liabilities, Equity, Revenue have credit normal balance
      if (['asset', 'expense'].includes(this.type)) return 'debit';
      return 'credit';
    }
  },
  parentAccount: { type: String, default: null }, // Parent account number for hierarchy
  isSystem: { type: Boolean, default: false }, // true for core accounts
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Indexes for performance
AccountSchema.index({ class: 1, number: 1 });
AccountSchema.index({ type: 1 });

// Method to get full hierarchy path
AccountSchema.methods.getHierarchyPath = async function() {
  const path = [this.number];
  let current = this;
  
  while (current.parentAccount) {
    const parent = await this.model('Account').findOne({ number: current.parentAccount });
    if (!parent) break;
    path.unshift(parent.number);
    current = parent;
  }
  
  return path;
};

const Account = mongoose.model('Account', AccountSchema);
export default Account;
