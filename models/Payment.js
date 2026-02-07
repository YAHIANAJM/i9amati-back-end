import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const PaymentSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  totalAmount: { type: Number, required: true },
  method: { type: String, enum: ['cash', 'cheque', 'bank', 'cmi', 'transfer', 'auto_debit'], required: true },
  payment_type: { type: String, enum: ['automatic', 'manual'], default: 'automatic' },
  reference: { type: String }, // cheque number, bank ref, etc.
  account: { type: Schema.Types.ObjectId, ref: 'Account' }, // bank/cash account
  journalEntry: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
  status: { type: String, enum: ['pending', 'confirmed', 'cancelled', 'paid_manually', 'paid_effectively'], default: 'confirmed' },
  receipt_document: { type: Schema.Types.ObjectId, ref: 'Document' }, // Scanned bank receipt for manual payments
  receipt_uploaded_at: { type: Date },
}, { timestamps: true });

const Payment = mongoose.model('Payment', PaymentSchema);
export default Payment;
