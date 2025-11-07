import mongoose from 'mongoose';

const ApartmentSchema = new mongoose.Schema({
  apartment_number: { type: String, required: true }, // clearer name
  floor: { type: Number },        // optional
  space: { type: Number },        // optional (in m²)
  name: { type: String },
  type: { type: String, default: 'residential' },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: 'UnionAgent', required: true },
  building: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', required: true },
  owners: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

export default mongoose.model('Apartment', ApartmentSchema);
