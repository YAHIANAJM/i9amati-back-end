import mongoose from 'mongoose';

const ApartmentSchema = new mongoose.Schema({
  number: { type: String, required: true },
  floor: { type: Number, required: true },
  space: { type: Number, required: true }, // m²
  agent: { type: mongoose.Schema.Types.ObjectId, ref: 'UnionAgent', required: true },
  building: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', required: true },
  owners: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

export default mongoose.model('Apartment', ApartmentSchema);
