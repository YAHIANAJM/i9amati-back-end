import mongoose from 'mongoose';

const LegalResourceSchema = new mongoose.Schema({
  residence_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Residence' },
  title: { type: String, required: true },
  description: String,
  file_path: String
});

export default mongoose.model('LegalResourceLegacy', LegalResourceSchema);
