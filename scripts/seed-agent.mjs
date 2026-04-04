import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();

await mongoose.connect(process.env.MONGO_URI);
console.log("✅ Connected to MongoDB");

const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password_hash: String,
  nationalId: String,
  role: String,
  status: String,
}, { timestamps: true }));

const email = "yahyafreeninja@gmail.com";
const password = "Agent1234!";

const existing = await User.findOne({ email });
if (existing) {
  console.log(`⚠️  User already exists: ${email} (role: ${existing.role})`);
  await mongoose.disconnect();
  process.exit(0);
}

const hashed = await bcrypt.hash(password, 10);
const agent = await User.create({
  name: "وكيل الاتحاد — يحيى",
  email,
  password_hash: hashed,
  role: "union_agent",
  status: "ACTIVE",
});

console.log("✅ Union agent created:");
console.log(`   Name  : ${agent.name}`);
console.log(`   Email : ${agent.email}`);
console.log(`   Pass  : ${password}`);
console.log(`   Role  : ${agent.role}`);

await mongoose.disconnect();
