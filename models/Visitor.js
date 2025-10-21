import mongoose from 'mongoose';

const VisitorSchema = new mongoose.Schema({
  residence_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Residence', required: true },
  name: { type: String, required: true },
  id_number: String,
  car_plate: String,
  purpose: String,
  check_in: Date,
  check_out: Date
});

export default mongoose.model('Visitor', VisitorSchema);
