import mongoose from 'mongoose';

const FinancialSchema = new mongoose.Schema({
  unit_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  apartment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Apartment' },
  owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, enum: ['CONTRIBUTION','PAYMENT','EXPENSE'], required: true },
  description: String,
  amount: { type: Number, required: true },
  currency: { type: String, default: 'EUR' },
  due_date: Date,
  paid_at: Date,
  status: { type: String, enum: ['PENDING','PAID','OVERDUE'], default: 'PENDING' }
}, { timestamps: true });

export default mongoose.model('Financial', FinancialSchema);
