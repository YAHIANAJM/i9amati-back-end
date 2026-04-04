import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();

await mongoose.connect(process.env.MONGO_URI);
console.log("✅ Connected to MongoDB");

const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
  name: String, email: { type: String, unique: true }, password_hash: String,
  nationalId: String, role: String, status: String,
}, { timestamps: true }));

const Building = mongoose.models.Building || mongoose.model("Building", new mongoose.Schema({
  building_code: String, building_name: String, building_address: String,
  original_title_number: String, propertyPlanNumber: String,
  land_area_sqm: Number, total_units: Number,
  avg_floors_per_block: Number,
  has_garage: Boolean, has_pool: Boolean, has_elevator: Boolean, hasElevator: Boolean,
  hasSharedParts: Boolean, sharedWithTitleDeed: String,
  union_type: { type: String, default: "immeuble" },
  residence: { type: mongoose.Schema.Types.ObjectId, ref: "Residence" },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  apartments: [{ type: mongoose.Schema.Types.ObjectId }],
  description: String,
}, { timestamps: true }));

const Apartment = mongoose.models.Apartment || mongoose.model("Apartment", new mongoose.Schema({
  unit_code: String, main_plot_number: String, sub_title_number: String,
  area_sqm: Number, floor: Number, usage_type: String,
  registration_number: String, division_number: Number,
  share_common: Number,
  percentage_of_apartment: Number,
  building: { type: mongoose.Schema.Types.ObjectId, ref: "Building" },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  representativeUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  owners: [{ firstName: String, lastName: String, nationalId: String, email: String, phone: String, isRepresentative: Boolean }],
  ownerCredentials: [{ owner: { type: mongoose.Schema.Types.ObjectId }, email: String, password: String }],
}, { timestamps: true }));

const Notification = mongoose.models.Notification || mongoose.model("Notification", new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: String, message: String,
  type: { type: String, default: "info" },
  priority: { type: String, default: "normal" },
  status: { type: String, default: "unread" },
  reference_id: { type: mongoose.Schema.Types.ObjectId },
  reference_type: String,
  metadata: mongoose.Schema.Types.Mixed,
  created_at: { type: Date, default: Date.now },
}));

// ─── Find both agents ────────────────────────────────────────────────────────
const agentMain  = await User.findOne({ email: "agent@iqamati.ma" });
const agentYahya = await User.findOne({ email: "yahyafreeninja@gmail.com" });

if (!agentMain)  { console.error("❌ agent@iqamati.ma not found");        process.exit(1); }
if (!agentYahya) { console.error("❌ yahyafreeninja@gmail.com not found"); process.exit(1); }

console.log(`👤 Main agent  : ${agentMain.name}  (${agentMain.email})`);
console.log(`👤 Yahya agent : ${agentYahya.name} (${agentYahya.email})`);

// ─── Step 1: Create a building for Yahya ─────────────────────────────────────
console.log("\n🏢 Creating building for yahyafreeninja@gmail.com ...");

const yahyaBuilding = await Building.create({
  building_name: "عمارة الياسمين",
  building_address: "شارع الحسن الثاني، الرباط",
  original_title_number: "55/77777",
  propertyPlanNumber: "55/77777",
  land_area_sqm: 380,
  total_units: 3,
  avg_floors_per_block: 3,
  has_elevator: false,
  hasElevator: false,
  has_garage: true,
  has_pool: false,
  hasSharedParts: false,
  union_type: "immeuble",
  agent: agentYahya._id,
  description: "عمارة سكنية تابعة لوكيل الاتحاد يحيى",
});

// Add 3 apartments for Yahya's building
const yahyaApts = [
  { code: "Y01", floor: 1, area: 90, share: 34.0, subTitle: "55/77777/01" },
  { code: "Y02", floor: 2, area: 85, share: 33.0, subTitle: "55/77777/02" },
  { code: "Y03", floor: 3, area: 80, share: 33.0, subTitle: "55/77777/03" },
];

for (const a of yahyaApts) {
  const apt = await Apartment.create({
    unit_code: a.code,
    main_plot_number: "55/77777",
    sub_title_number: a.subTitle,
    area_sqm: a.area,
    floor: a.floor,
    usage_type: "residential",
    share_common: a.share,
    percentage_of_apartment: a.share,
    building: yahyaBuilding._id,
    agent: agentYahya._id,
    owners: [],
  });
  await Building.findByIdAndUpdate(yahyaBuilding._id, { $push: { apartments: apt._id } });
  console.log(`  ✅ Apt ${a.code} — share: ${a.share}%`);
}

console.log(`\n✅ Yahya's building created — Plan: 55/77777`);

// ─── Step 2: Create a new building for agent@iqamati.ma that shares parts ────
console.log("\n🏢 Creating building for agent@iqamati.ma with shared parts ...");

const mainBuilding = await Building.create({
  building_name: "عمارة الفل",
  building_address: "شارع الحسن الثاني، الرباط",
  original_title_number: "55/88888",
  propertyPlanNumber: "55/88888",
  land_area_sqm: 310,
  total_units: 2,
  avg_floors_per_block: 2,
  has_elevator: false,
  hasElevator: false,
  has_garage: false,
  has_pool: false,
  hasSharedParts: true,
  sharedWithTitleDeed: "55/77777",   // ← points to Yahya's building
  union_type: "immeuble",
  agent: agentMain._id,
  description: "عمارة لها أجزاء مشتركة مع عمارة الياسمين",
});

// Also mark Yahya's building as having shared parts
await Building.findByIdAndUpdate(yahyaBuilding._id, {
  hasSharedParts: true,
  sharedWithTitleDeed: "55/88888",
});

// Add 2 apartments for main agent's building
const mainApts = [
  { code: "F01", floor: 1, area: 100, share: 52.0, subTitle: "55/88888/01" },
  { code: "F02", floor: 2, area: 95,  share: 48.0, subTitle: "55/88888/02" },
];

for (const a of mainApts) {
  const apt = await Apartment.create({
    unit_code: a.code,
    main_plot_number: "55/88888",
    sub_title_number: a.subTitle,
    area_sqm: a.area,
    floor: a.floor,
    usage_type: "residential",
    share_common: a.share,
    percentage_of_apartment: a.share,
    building: mainBuilding._id,
    agent: agentMain._id,
    owners: [],
  });
  await Building.findByIdAndUpdate(mainBuilding._id, { $push: { apartments: apt._id } });
  console.log(`  ✅ Apt ${a.code} — share: ${a.share}%`);
}

console.log(`\n✅ Main agent's building created — Plan: 55/88888 (shared with 55/77777)`);

// ─── Step 3: Send notification to Yahya ──────────────────────────────────────
console.log("\n🔔 Sending in-app notification to yahyafreeninja@gmail.com ...");

await Notification.create({
  user:           agentYahya._id,
  title:          "أجزاء مشتركة مع عمارة مجاورة",
  message:        `تفيدكم إدارة "عمارة الفل" (رسم عقاري: 55/88888) بأن لديها أجزاء مشتركة مع "عمارة الياسمين". يرجى مراجعة قسم الوثائق ورفع الوثيقة القانونية المثبتة لذلك.`,
  type:           "document",
  priority:       "high",
  reference_id:   mainBuilding._id,
  reference_type: "Building",
  metadata: {
    action:          "upload_shared_parts_document",
    newBuildingId:   mainBuilding._id,
    theirBuildingId: yahyaBuilding._id,
    newBuildingPlan: "55/88888",
  },
});

console.log("✅ Notification sent to Yahya");

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log("\n─────────────────────────────────────────────");
console.log("🏢 yahyafreeninja@gmail.com → عمارة الياسمين (55/77777) — 3 شقق");
console.log("🏢 agent@iqamati.ma        → عمارة الفل     (55/88888) — 2 شقق");
console.log("🔗 Shared parts link: 55/88888 ↔ 55/77777");
console.log("🔔 In-app notification sent to yahyafreeninja@gmail.com");
console.log("─────────────────────────────────────────────");

await mongoose.disconnect();
