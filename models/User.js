import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true }, // ✅ ADD THIS
  password_hash: { type: String, required: true }, 
  nationalId: { type: String }, // e.g., BW123****
  role: { type: String, enum: ['supervisor', 'union_agent', 'property_owner'], required: true },
  apartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Apartment' },
  status: { type: String, enum: ['ACTIVE','INACTIVE'], default: 'ACTIVE' },
}, { timestamps: true });

export default mongoose.model('User', UserSchema);
