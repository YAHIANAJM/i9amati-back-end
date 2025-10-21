import mongoose from 'mongoose';



const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, unique: true, sparse: true }, // for property owners
  email: { type: String, unique: true, sparse: true },
  phone: String,
  password_hash: { type: String, required: true },
  role: { type: String, enum: ['supervisor', 'union_agent', 'property_owner'], required: true },
  apartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Apartment' }, // for property owners
  status: { type: String, enum: ['ACTIVE','INACTIVE'], default: 'ACTIVE' },
}, { timestamps: true });

export default mongoose.model('User', UserSchema);
