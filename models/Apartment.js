// models/Apartment.js
import mongoose from 'mongoose';

const ApartmentSchema = new mongoose.Schema({
  number: { type: String, required: true },
  floor: { type: Number, required: true },
  space: { type: Number, required: true },
  apartment_number: { type: String, required: true }, // clearer name
  floor: { type: Number },        // optional
  space: { type: Number },        // optional (in m²)
  name: { type: String },
  type: { type: String, default: 'residential' },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: 'UnionAgent', required: true },
  building: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', required: true },
  owners: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // ✅ ADD THIS: store initial credentials for display
  ownerCredentials: [{
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    email: { type: String, required: true },
    password: { type: String, required: true } // plaintext — for agent use only
  }]
}, { timestamps: true });

export default mongoose.model('Apartment', ApartmentSchema);