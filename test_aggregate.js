import mongoose from "mongoose";
import dotenv from "dotenv";
import Building from "./models/Building.js";
import User from "./models/User.js";

dotenv.config();

const RESEED_AGENT_EMAIL = "agent@iqamati.ma";

async function testAggregate() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const agent = await User.findOne({ email: RESEED_AGENT_EMAIL });
    const agentIdStr = agent._id.toString();
    
    // Test with string
    console.log("Testing with string agentId:", agentIdStr);
    const resultString = await Building.aggregate([
      { $match: { agent: agentIdStr } }
    ]);
    console.log("Count with string match:", resultString.length);

    // Test with ObjectId
    console.log("Testing with ObjectId agentId:", agent._id);
    const resultObj = await Building.aggregate([
      { $match: { agent: agent._id } }
    ]);
    console.log("Count with ObjectId match:", resultObj.length);

    mongoose.connection.close();
  } catch (err) {
    console.error(err);
  }
}

testAggregate();
