import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password_hash: { type: String, required: true },

    nationalId: { type: String }, // CIN or passport

    role: {
      type: String,
      enum: ["supervisor", "union_agent", "property_owner"],
      required: true,
    },

    // owner can own multiple apartments
    apartments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Apartment" }],

    groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }],

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", UserSchema);
