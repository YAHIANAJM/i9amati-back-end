import mongoose from 'mongoose';

const ResidenceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  city: String
}, { timestamps: { createdAt: 'created_at' } });

export default mongoose.model('Residence', ResidenceSchema);
