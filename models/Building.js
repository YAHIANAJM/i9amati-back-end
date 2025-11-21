import mongoose from "mongoose";

const BuildingSchema = new mongoose.Schema(
  {
    building_code: { type: String }, // ex: A7, A13
    building_name: { type: String, required: true },
    building_address: { type: String },

    residenceCode: { type: String, unique: true },

    land_area_sqm: { type: Number },
    total_units: { type: Number },
    number_of_blocks: { type: Number },
    avg_units_per_block: { type: Number },
    avg_floors_per_block: { type: Number },

    original_title_number: { type: String }, // الرسم العقاري

    has_garage: { type: Boolean, default: false },
    has_pool: { type: Boolean, default: false },
    has_shared_parts_with_other_buildings: { type: Boolean, default: false },

    documents: [{ type: String }],
    description: { type: String },

    // the syndic agent assigned to this building
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Apartments inside this building
    apartments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Apartment" }],
  },
  { timestamps: true }
);

export default mongoose.model("Building", BuildingSchema);
