import mongoose from 'mongoose';

const ServiceReportSchema = new mongoose.Schema({
  report_date: Date,
  notes: String
});

const ServiceSchema = new mongoose.Schema({
  residence_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Residence', required: true },
  type: { type: String, enum: ['CLEANING','GARDENING','SECURITY'], required: true },
  provider: String,
  schedule: Object, // JSON object
  status: { type: String, enum: ['ACTIVE','INACTIVE'], default: 'ACTIVE' },
  reports: [ServiceReportSchema]
});

export default mongoose.model('Service', ServiceSchema);
