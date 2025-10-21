// backend/seed.js
import mongoose from "mongoose";
import User from "./models/User.js";
import UnionAgent from "./models/UnionAgent.js";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Resolve backend directory and load backend/.env reliably on Windows
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, ".env");
console.log("Attempting to load env from:", envPath);
dotenv.config({ path: envPath });

// Debug: show whether MONGO_URI was loaded (masked)
if (process.env.MONGO_URI) {
  const uri = process.env.MONGO_URI;
  const masked =
    uri.length > 30 ? uri.slice(0, 20) + "..." + uri.slice(-10) : uri;
  console.log("Loaded MONGO_URI from .env (masked):", masked);
} else {
  console.log("No MONGO_URI found in environment");
}

async function seed() {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/iqamati";
  console.log(
    "Seed will connect to:",
    uri.startsWith("mongodb+srv") ? "MongoDB Atlas (SRV)" : uri
  );
  if (!uri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }
  await mongoose.connect(uri);

  // Remove all users and union agents
  await User.deleteMany({});
  await UnionAgent.deleteMany({});

  // Create single union agent user as requested
  const unionAgentEmail = "ac1003.agent@example.com";
  const unionAgentPassword = "AC1003pass!";
  const unionAgent = new User({
    name: "AC1003 Agent",
    email: unionAgentEmail,
    password_hash: await bcrypt.hash(unionAgentPassword, 10),
    role: "union_agent",
  });
  await unionAgent.save();

  const prefix = "AC1003";
  await new UnionAgent({
    email: unionAgent.email,
    prefix,
    user: unionAgent._id,
  }).save();

  console.log("Seeded single union_agent:", unionAgentEmail);
  await mongoose.disconnect();
  process.exit(0);
}

seed();
