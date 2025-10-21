import mongoose from 'mongoose';

const LegalResourceSchema = new mongoose.Schema({
  residence_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Residence' },
  title: { type: String, required: true },
  description: String,
  file_path: String,
  url: String,
  uploaded_at: { type: Date, default: Date.now }
});

export default mongoose.model('LegalResource', LegalResourceSchema);


