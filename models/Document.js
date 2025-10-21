import mongoose from 'mongoose';

// Generic document model for uploaded documents (policies, reports, etc.)
const DocumentSchema = new mongoose.Schema({
  residence_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Residence' },
  title: { type: String, required: true },
  type: { type: String }, // e.g. PDF, DOCX
  category: { type: String }, // e.g. Legal, Financial
  uploaded_at: { type: Date, default: Date.now },
  size_bytes: { type: Number },
  url: { type: String }, // optional public URL
  file_path: { type: String } // optional server path
});

export default mongoose.model('Document', DocumentSchema);
