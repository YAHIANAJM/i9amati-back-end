import mongoose from 'mongoose';

const GroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  managers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  is_active: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('Group', GroupSchema);
