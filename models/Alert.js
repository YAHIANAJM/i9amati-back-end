import mongoose from 'mongoose';

const AlertSchema = new mongoose.Schema({
  residence_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Residence' },
  title: { type: String },
  category: { type: String, enum: ['FINANCIAL','MAINTENANCE','SOCIAL','EMERGENCY'], required: true },
  priority: { type: String, enum: ['low','medium','high','critical'], default: 'low' },
  message: String,
  status: { type: String, enum: ['NEW','RESOLVED'], default: 'NEW' },
  isRead: { type: Boolean, default: false },
  actionRequired: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  resolved_at: { type: Date }
});

export default mongoose.model('Alert', AlertSchema);
