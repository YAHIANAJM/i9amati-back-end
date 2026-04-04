import mongoose from 'mongoose';

const ResidenceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  city: String,

  // Buildings inside this residence
  buildings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Building' }],

  // The union agent managing this residence
  agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Governance council (for إقامة)
  council_president: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  council_representatives: [
    {
      building: { type: mongoose.Schema.Types.ObjectId, ref: 'Building' },
      agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
  ],
}, { timestamps: { createdAt: 'created_at' } });

export default mongoose.model('Residence', ResidenceSchema);
