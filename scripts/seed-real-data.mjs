import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();

// ─── Connect ────────────────────────────────────────────────────────────────
await mongoose.connect(process.env.MONGO_URI);
console.log("✅ Connected to MongoDB");

// ─── Models (inline schemas to avoid import issues) ─────────────────────────
const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
  name: String, email: { type: String, unique: true }, password_hash: String,
  nationalId: String, role: String, status: String,
  apartments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Apartment" }],
  groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }],
}, { timestamps: true }));

const Building = mongoose.models.Building || mongoose.model("Building", new mongoose.Schema({
  building_code: String, building_name: String, building_address: String,
  original_title_number: String, propertyPlanNumber: String,
  land_area_sqm: Number, total_units: Number, number_of_blocks: Number,
  avg_units_per_block: Number, avg_floors_per_block: Number,
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
  registration_number: String, division_number: Number, land_share_ratio: String,
  share_common: Number, share_building: Number, share_residence: Number,
  percentage_of_apartment: Number,
  building: { type: mongoose.Schema.Types.ObjectId, ref: "Building" },
  residence: { type: mongoose.Schema.Types.ObjectId, ref: "Residence" },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  representativeUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  owners: [{
    firstName: String, lastName: String, nationalId: String,
    email: String, phone: String, isRepresentative: Boolean,
  }],
  ownerCredentials: [{
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    email: String, password: String,
  }],
}, { timestamps: true }));

const Residence = mongoose.models.Residence || mongoose.model("Residence", new mongoose.Schema({
  name: String, address: String, city: String,
  buildings: [{ type: mongoose.Schema.Types.ObjectId, ref: "Building" }],
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  council_president: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  council_representatives: [{ building: mongoose.Schema.Types.ObjectId, agent: mongoose.Schema.Types.ObjectId }],
}, { timestamps: { createdAt: "created_at" } }));

// ─── Step 1: Find the union_agent ───────────────────────────────────────────
const agent = await User.findOne({ role: "union_agent" });
if (!agent) {
  console.error("❌ No union_agent found. Please create one first.");
  process.exit(1);
}
console.log(`👤 Using agent: ${agent.name} (${agent.email})`);

// ─── Step 2: Delete existing buildings, apartments, owners ──────────────────
const existingBuildings = await Building.find({}).select("_id");
const buildingIds = existingBuildings.map((b) => b._id);

const existingApartments = await Apartment.find({}).select("_id representativeUser");
const ownerUserIds = existingApartments
  .map((a) => a.representativeUser)
  .filter(Boolean);

await Apartment.deleteMany({});
console.log("🗑️  Deleted all apartments");

await Building.deleteMany({});
console.log("🗑️  Deleted all buildings");

await Residence.deleteMany({});
console.log("🗑️  Deleted all residences");

// Only delete property_owner users (not agents or supervisors)
await User.deleteMany({ role: "property_owner" });
console.log("🗑️  Deleted all property_owner users");

// ─── Helper: create owner user ───────────────────────────────────────────────
async function createOwnerUser(firstName, lastName, nationalId, unitCode, buildingName) {
  const emailLocal = `${unitCode.toLowerCase()}.${buildingName.toLowerCase()}.${firstName.toLowerCase()}`
    .replace(/\s+/g, "").replace(/[^a-z0-9.\-@]/g, "");
  const email = `${emailLocal}@owner.com`;
  const existing = await User.findOne({ email });
  if (existing) return existing;
  const hashed = await bcrypt.hash(nationalId, 10);
  return await User.create({
    name: `${firstName} ${lastName}`,
    email,
    password_hash: hashed,
    nationalId,
    role: "property_owner",
    status: "ACTIVE",
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SEED 1: عمارة (Immeuble) — عمارة الورود، الدار البيضاء
// Single building, 4 apartments, each has one share_common
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n🏢 Creating عمارة — Immeuble Al Wouroud...");

const immeubleBuilding = await Building.create({
  building_name: "عمارة الورود",
  building_address: "شارع محمد الخامس، الدار البيضاء",
  original_title_number: "38/163500",
  propertyPlanNumber: "38/163500",
  land_area_sqm: 420,
  total_units: 4,
  avg_floors_per_block: 4,
  has_elevator: true,
  hasElevator: true,
  has_garage: false,
  has_pool: false,
  hasSharedParts: false,
  union_type: "immeuble",
  agent: agent._id,
  description: "عمارة سكنية من 4 طوابق في قلب الدار البيضاء",
});

// 4 apartments — share_common must sum to 100%
const immeubleApts = [
  { code: "A01", floor: 1, area: 95, share: 26.5, subTitle: "38/163500/01", regNum: "38/163501", divNum: 1,
    owner: { first: "يوسف", last: "العلوي", cin: "BE123456", phone: "0661234567" } },
  { code: "A02", floor: 2, area: 95, share: 26.5, subTitle: "38/163500/02", regNum: "38/163502", divNum: 2,
    owner: { first: "فاطمة", last: "بنعلي", cin: "BJ987654", phone: "0662345678" } },
  { code: "A03", floor: 3, area: 88, share: 24.0, subTitle: "38/163500/03", regNum: "38/163503", divNum: 3,
    owner: { first: "عمر", last: "الحسيني", cin: "BK456789", phone: "0663456789" } },
  { code: "A04", floor: 4, area: 85, share: 23.0, subTitle: "38/163500/04", regNum: "38/163504", divNum: 4,
    owner: { first: "سارة", last: "المنصوري", cin: "BL654321", phone: "0664567890" } },
];

for (const a of immeubleApts) {
  const repUser = await createOwnerUser(a.owner.first, a.owner.last, a.owner.cin, a.code, "alwouroud");
  const apt = await Apartment.create({
    unit_code: a.code,
    main_plot_number: "38/163500",
    sub_title_number: a.subTitle,
    registration_number: a.regNum,
    division_number: a.divNum,
    area_sqm: a.area,
    floor: a.floor,
    usage_type: "residential",
    share_common: a.share,
    percentage_of_apartment: a.share,
    building: immeubleBuilding._id,
    agent: agent._id,
    representativeUser: repUser._id,
    owners: [{
      firstName: a.owner.first, lastName: a.owner.last,
      nationalId: a.owner.cin, email: repUser.email,
      phone: a.owner.phone, isRepresentative: true,
    }],
    ownerCredentials: [{ owner: repUser._id, email: repUser.email, password: a.owner.cin }],
  });
  await Building.findByIdAndUpdate(immeubleBuilding._id, { $push: { apartments: apt._id } });
  console.log(`  ✅ Apt ${a.code} — ${a.owner.first} ${a.owner.last} — ${a.share}%`);
}

// ══════════════════════════════════════════════════════════════════════════════
// SEED 2: إقامة (Résidence) — إقامة النخيل، الرباط
// 2 buildings, each with 3 apartments, each apt has share_building + share_residence
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n🏘️  Creating إقامة — Résidence Al Nakhil...");

const residence = await Residence.create({
  name: "إقامة النخيل",
  address: "حي الرياض، الرباط",
  city: "الرباط",
  agent: agent._id,
  buildings: [],
});

// Building A — رسم عقاري: 12/98765
const buildingA = await Building.create({
  building_name: "العمارة أ",
  building_address: "حي الرياض، الرباط",
  original_title_number: "12/98765",
  propertyPlanNumber: "12/98765",
  avg_floors_per_block: 3,
  total_units: 3,
  has_elevator: true, hasElevator: true,
  has_garage: false, has_pool: false,
  union_type: "residence",
  residence: residence._id,
  agent: agent._id,
});

// Building B — رسم عقاري: 12/98766
const buildingB = await Building.create({
  building_name: "العمارة ب",
  building_address: "حي الرياض، الرباط",
  original_title_number: "12/98766",
  propertyPlanNumber: "12/98766",
  avg_floors_per_block: 3,
  total_units: 3,
  has_elevator: false, hasElevator: false,
  has_garage: true, has_pool: false,
  union_type: "residence",
  residence: residence._id,
  agent: agent._id,
});

// Apartments for Building A
// share_building: sum per building = 100%
// share_residence: sum across all 6 apartments = 100%
const buildingAApts = [
  { code: "A-101", floor: 1, area: 110, shareBld: 36.0, shareRes: 20.0, subTitle: "12/98765/01",
    owner: { first: "خالد", last: "الراشدي", cin: "AA111222", phone: "0671112222" } },
  { code: "A-201", floor: 2, area: 105, shareBld: 34.0, shareRes: 18.5, subTitle: "12/98765/02",
    owner: { first: "نادية", last: "الطاهري", cin: "AA333444", phone: "0672334455" } },
  { code: "A-301", floor: 3, area: 85,  shareBld: 30.0, shareRes: 15.0, subTitle: "12/98765/03",
    owner: { first: "رشيد", last: "أوزين", cin: "AA555666", phone: "0673556677" } },
];

// Apartments for Building B
const buildingBApts = [
  { code: "B-101", floor: 1, area: 120, shareBld: 38.0, shareRes: 22.0, subTitle: "12/98766/01",
    owner: { first: "أمينة", last: "الشرقاوي", cin: "BB111222", phone: "0674112233" } },
  { code: "B-201", floor: 2, area: 100, shareBld: 32.0, shareRes: 15.5, subTitle: "12/98766/02",
    owner: { first: "إدريس", last: "بوعزة", cin: "BB333444", phone: "0675334455" } },
  { code: "B-301", floor: 3, area: 90,  shareBld: 30.0, shareRes: 9.0,  subTitle: "12/98766/03",
    owner: { first: "مريم", last: "الزياني", cin: "BB555666", phone: "0676556677" } },
];

for (const a of buildingAApts) {
  const repUser = await createOwnerUser(a.owner.first, a.owner.last, a.owner.cin, a.code, "nakhila");
  const apt = await Apartment.create({
    unit_code: a.code,
    main_plot_number: "12/98765",
    sub_title_number: a.subTitle,
    area_sqm: a.area,
    floor: a.floor,
    usage_type: "residential",
    share_building: a.shareBld,
    share_residence: a.shareRes,
    building: buildingA._id,
    agent: agent._id,
    representativeUser: repUser._id,
    owners: [{
      firstName: a.owner.first, lastName: a.owner.last,
      nationalId: a.owner.cin, email: repUser.email,
      phone: a.owner.phone, isRepresentative: true,
    }],
    ownerCredentials: [{ owner: repUser._id, email: repUser.email, password: a.owner.cin }],
  });
  await Building.findByIdAndUpdate(buildingA._id, { $push: { apartments: apt._id } });
  console.log(`  ✅ Apt ${a.code} — ${a.owner.first} ${a.owner.last} — bld:${a.shareBld}% res:${a.shareRes}%`);
}

for (const a of buildingBApts) {
  const repUser = await createOwnerUser(a.owner.first, a.owner.last, a.owner.cin, a.code, "nakhibl");
  const apt = await Apartment.create({
    unit_code: a.code,
    main_plot_number: "12/98766",
    sub_title_number: a.subTitle,
    area_sqm: a.area,
    floor: a.floor,
    usage_type: "residential",
    share_building: a.shareBld,
    share_residence: a.shareRes,
    building: buildingB._id,
    agent: agent._id,
    representativeUser: repUser._id,
    owners: [{
      firstName: a.owner.first, lastName: a.owner.last,
      nationalId: a.owner.cin, email: repUser.email,
      phone: a.owner.phone, isRepresentative: true,
    }],
    ownerCredentials: [{ owner: repUser._id, email: repUser.email, password: a.owner.cin }],
  });
  await Building.findByIdAndUpdate(buildingB._id, { $push: { apartments: apt._id } });
  console.log(`  ✅ Apt ${a.code} — ${a.owner.first} ${a.owner.last} — bld:${a.shareBld}% res:${a.shareRes}%`);
}

// Link buildings to residence
await Residence.findByIdAndUpdate(residence._id, {
  buildings: [buildingA._id, buildingB._id],
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log("\n✅ Seed complete!");
console.log("─────────────────────────────────────────────");
console.log("🏢 عمارة الورود: 4 شقق — نسبة مشتركة واحدة لكل شقة (مجموع 100%)");
console.log("   A01: 26.5% | A02: 26.5% | A03: 24.0% | A04: 23.0%");
console.log("🏘️  إقامة النخيل: عمارتان، 3 شقق لكل عمارة");
console.log("   العمارة أ: A-101(36%) A-201(34%) A-301(30%) — مجموع 100%");
console.log("   العمارة ب: B-101(38%) B-201(32%) B-301(30%) — مجموع 100%");
console.log("   نسب الإقامة الكاملة: 20+18.5+15+22+15.5+9 = 100%");
console.log("─────────────────────────────────────────────");

await mongoose.disconnect();
