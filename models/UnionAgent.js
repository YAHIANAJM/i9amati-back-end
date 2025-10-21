import mongoose from 'mongoose';


const UnionAgentSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  prefix: { type: String, required: true, immutable: true },
  apartments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Apartment' }],
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});

export default mongoose.model('UnionAgent', UnionAgentSchema);
