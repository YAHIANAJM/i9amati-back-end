import mongoose from 'mongoose';

const BuildingSchema = new mongoose.Schema({
  residence_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Residence', required: true },
  name: { type: String, required: true },
  description: String
});

export default mongoose.model('Building', BuildingSchema);
