import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const ContributionSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  unit: { type: Schema.Types.ObjectId, ref: 'Apartment', required: true }, // Changed from Unit to Apartment
  year: { type: Number, required: true },
  contributionType: { 
    type: String, 
    enum: ['regular', 'special', 'advance'], 
    default: 'regular',
    required: true 
  }, // Law 18.00: regular (Art.35), special (Art.37), advance (Art.38)
  dueAmount: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  remaining: { type: Number, required: true },
  status: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' },
  generalAssemblyRef: { type: String }, // reference to assembly decision
}, { timestamps: true });

ContributionSchema.index({ owner: 1, unit: 1, year: 1, contributionType: 1 });

const Contribution = mongoose.model('Contribution', ContributionSchema);
export default Contribution;
