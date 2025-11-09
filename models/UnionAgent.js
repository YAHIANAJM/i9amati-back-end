// models/UnionAgent.js
import mongoose from 'mongoose';

const UnionAgentSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  prefix: { type: String, required: true, immutable: true },
  buildings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Building' }], // ✅ updated
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

export default mongoose.model('UnionAgent', UnionAgentSchema);
