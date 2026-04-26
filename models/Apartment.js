import mongoose from "mongoose";

const ApartmentSchema = new mongoose.Schema(
  {
    // Unit Identification
    unit_code: { type: String },

    // From ownership certificate
    unit_description: { type: String },
    registration_number: { type: String },
    final_registration_number: { type: String },
    original_registration_number: { type: String },

    // Plot & division info
    main_plot_number: { type: String, required: true }, // canonical plot ID
    division_number: { type: Number, min: 1 }, // small integer, e.g., 20

    // Area metrics
    area_sqm: { type: Number },
    roof_share_sqm: { type: Number },
    land_share_area: { type: Number, min: 0 },

    // Ownership shares
    percentage_of_apartment: { type: Number, min: 0, max: 100 }, // e.g., 2.5
    land_share_ratio: { type: String }, // e.g., "1.8%"
    percentage_of_residence: { type: Number, min: 0, max: 100 }, // apartment's share in the overall إقامة compound
    common_share_ratio: { type: String },

    // Building structure
    floor: { type: Number },
    usage_type: { type: String, default: "residential" },
    unit_type: { type: String },

    // Files
    ownership_certificate_file: { type: String }, // path to PDF

    // Relations
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
    },
    agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // ✅ EMBEDDED OWNERS (all owners, including rep)
    owners: [
      {
        firstName: { type: String, required: true },
        lastName: { type: String, required: true },
        nationalId: { type: String, required: true },
        email: { type: String, required: true },
        phone: { type: String },
        isRepresentative: { type: Boolean, default: false },
      },
    ],

    // ✅ ONLY the representative is a real User (for login)
    representativeUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // ✅ STORE AUTO-GENERATED CREDENTIALS (for retrieval by union agents)
    ownerCredentials: [
      {
        owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        email: { type: String },
        password: { type: String }, // AES-256-GCM encrypted credential (use decryptCredential() to read)
      },
    ],
  },
  { timestamps: true },
);

export default mongoose.model("Apartment", ApartmentSchema);
