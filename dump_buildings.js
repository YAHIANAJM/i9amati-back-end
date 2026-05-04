import mongoose from "mongoose";
import dotenv from "dotenv";
import Building from "./models/Building.js";
import User from "./models/User.js";

dotenv.config();

const RESEED_AGENT_EMAIL = "agent@iqamati.ma";

async function dump() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const agent = await User.findOne({ email: RESEED_AGENT_EMAIL });
    const buildings = await Building.find({ agent: agent._id });
    console.log("Buildings for", RESEED_AGENT_EMAIL, ":", JSON.stringify(buildings, null, 2));
    mongoose.connection.close();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

dump();
