import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const ContributionSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  unit: { type: Schema.Types.ObjectId, ref: 'Apartment', required: true }, // Changed from Unit to Apartment
  year: { type: Number, required: true },
  dueAmount: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  remaining: { type: Number, required: true },
  status: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' },
  generalAssemblyRef: { type: String }, // reference to assembly decision
}, { timestamps: true });

ContributionSchema.index({ owner: 1, unit: 1, year: 1 }, { unique: true });

const Contribution = mongoose.model('Contribution', ContributionSchema);
export default Contribution;
