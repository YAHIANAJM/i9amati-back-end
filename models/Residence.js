import mongoose from 'mongoose';

const ResidenceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    address: { type: String, required: true },
    city: String,
    description: { type: String },
    facilities: [{ type: String }],
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Added agent reference
    status: {
      type: String,
      enum: ["active", "maintenance", "inactive"],
      default: "active",
    },
    totalUnits: { type: Number, default: 0 },
    occupiedUnits: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "created_at" } }
);

export default mongoose.model("Residence", ResidenceSchema);
