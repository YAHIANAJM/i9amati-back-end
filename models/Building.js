import mongoose from "mongoose";

const BuildingSchema = new mongoose.Schema(
  {
    building_code: { type: String }, // ex: A7, A13
    building_name: { type: String, required: true },
    building_address: { type: String },

    // residenceCode removed: frontend no longer uses this server-side

    land_area_sqm: { type: Number },
    total_units: { type: Number },
    number_of_blocks: { type: Number },
    avg_units_per_block: { type: Number },
    avg_floors_per_block: { type: Number },

    original_title_number: { type: String }, // الرسم العقاري
    propertyPlanNumber: { type: String },
    // New fields to represent shared-title relationships
    hasSharedParts: { type: Boolean, default: false },
    sharedWithTitleDeed: { type: String, default: null }, // stores another building.propertyPlanNumber

    has_garage: { type: Boolean, default: false },
    has_pool: { type: Boolean, default: false },
    hasElevator: { type: Boolean, default: false },
    has_elevator: { type: Boolean, default: false },
    has_shared_parts_with_other_buildings: { type: Boolean, default: false },

    documents: [{ type: String }],
    description: { type: String },

    // the syndic agent assigned to this building
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // The residence this building belongs to (optional for standalone buildings)
    residence: { type: mongoose.Schema.Types.ObjectId, ref: "Residence", default: null },

    // The type of union: standalone (immeuble) or part of a residence
    union_type: { type: String, enum: ["immeuble", "residence"], default: "immeuble" },

    // Apartments inside this building
    apartments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Apartment" }],
  },
  { timestamps: true }
);

export default mongoose.model("Building", BuildingSchema);
