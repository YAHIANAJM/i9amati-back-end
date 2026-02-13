import mongoose from 'mongoose';

const ServiceReportSchema = new mongoose.Schema({
  report_date: Date,
  notes: String
});

const ServiceSchema = new mongoose.Schema({
  residence_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Residence', required: true },
  title: { type: String, required: true }, // e.g. "Annual Elevator Maintenance"
  type: { type: String, enum: ['CLEANING','GARDENING','SECURITY','MAINTENANCE','OTHER'], required: true },
  
  // Provider Details
  provider: {
    name: { type: String, required: true }, 
    address: { type: String },
    phone: String,
    email: String,
  },

  // Contract Details
  contract: {
    startDate: Date,
    endDate: Date,
    value: Number, // Cost
    documentUrl: String 
  },

  // Worker Schedules
  schedules: [{
    day: String, // e.g. "Monday" or specific date string
    startTime: String, // "09:00"
    endTime: String,   // "17:00"
    workerName: String,
    description: String, // Description of the shift
    tasks: [{
      text: String,
      status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
      attachments: [{
        type: { type: String, enum: ['image', 'video'] },
        url: String,
        publicId: String,
        uploadedAt: { type: Date, default: Date.now }
      }]
    }]
  }],

  status: { type: String, enum: ['ACTIVE','INACTIVE','PENDING'], default: 'ACTIVE' },
  reports: [ServiceReportSchema]
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export default mongoose.model('Service', ServiceSchema);
