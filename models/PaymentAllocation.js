import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const PaymentAllocationSchema = new Schema({
  payment: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
  unit: { type: Schema.Types.ObjectId, ref: 'Apartment', required: true }, // Changed from Unit to Apartment
  amount: { type: Number, required: true },
  contribution: { type: Schema.Types.ObjectId, ref: 'Contribution' }, // reference to updated contribution
}, { timestamps: true });

PaymentAllocationSchema.index({ payment: 1, unit: 1 });

const PaymentAllocation = mongoose.model('PaymentAllocation', PaymentAllocationSchema);
export default PaymentAllocation;
