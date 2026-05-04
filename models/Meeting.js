import mongoose from 'mongoose';

const VoteSchema = new mongoose.Schema({
  unit_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Apartment' },
  owner_name: String,
  unit_code: String,
  vote: { type: String, enum: ['YES','NO','ABSTAIN'], required: true },
  shares: Number,
  is_present: { type: Boolean, default: false }
});

const MeetingSchema = new mongoose.Schema({
  residence_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Residence', required: true },
  title: String,
  type: { type: String, enum: ['ORDINARY','EXTRAORDINARY','FOUNDING'], required: true },
  article_type: { type: Number, enum: [20, 21, 22], default: 20 },
  meeting_number: { type: Number, enum: [1, 2], default: 1 },
  agenda: String,
  agenda_file_url: String,
  agenda_file_name: String,
  scheduled_at: Date,
  status: { type: String, enum: ['PLANNED','ONGOING','COMPLETED'], default: 'PLANNED' },
  votes: [VoteSchema]
});

export default mongoose.model('Meeting', MeetingSchema);
