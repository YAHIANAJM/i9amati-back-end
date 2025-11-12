import mongoose from "mongoose";

const BuildingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    address: { type: String },
    residenceCode: { type: String, unique: true },
    propertyLandArea: { type: Number },
    numberOfBuildings: { type: Number },
    averageUnitsPerBuilding: { type: Number },
    averageFloorsPerBuilding: { type: Number },
    totalUnits: { type: Number },
    propertyPlanNumber: { type: String },
    hasGarage: { type: Boolean, default: false },
    hasSwimmingPool: { type: Boolean, default: false },
    sharedParts: { type: String },
    description: { type: String },
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group" },
    apartments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Apartment" }],
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // union agent responsible for this building
  },
  { timestamps: true }
);

export default mongoose.model("Building", BuildingSchema);
