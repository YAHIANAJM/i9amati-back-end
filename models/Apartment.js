import mongoose from "mongoose";

const ApartmentSchema = new mongoose.Schema(
  {
    // needed for IMMz-A13
    unit_code: { type: String },

    // from certificate
    unit_description: { type: String },
    registration_number: { type: String },
    final_registration_number: { type: String },
    division_number: { type: String },

    area_sqm: { type: Number },
    roof_share_sqm: { type: Number },

    floor: { type: Number },
    usage_type: { type: String, default: "residential" },

    land_share_ratio: { type: String },
    common_share_ratio: { type: String },

    original_registration_number: { type: String },
    unit_type: { type: String },

    ownership_certificate_file: { type: String }, // PDF path

    // RELATIONS
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
    },

    // MANY owners allowed
    owners: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Syndic agent (usually union_agent)
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // store initial generated credentials (optional)
    ownerCredentials: [
      {
        owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        email: { type: String },
        password: { type: String },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Apartment", ApartmentSchema);
