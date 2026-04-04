// scripts/reseed-agent-data.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import Building from "../models/Building.js";
import Residence from "../models/Residence.js";
import Apartment from "../models/Apartment.js";
import User from "../models/User.js";
import Group from "../models/Group.js";

dotenv.config();

const RESEED_AGENT_EMAIL = "agent@iqamati.ma";

async function reseed() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI not found in environment variables");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to DB for reseeding...");

    // Find the agent
    const agent = await User.findOne({ email: RESEED_AGENT_EMAIL });
    if (!agent) {
      console.error(`❌ Agent ${RESEED_AGENT_EMAIL} not found!`);
      process.exit(1);
    }

    const agentId = agent._id;

    // 1. Identify data to delete
    const apartments = await Apartment.find({ agent: agentId });
    const aptIds = apartments.map(a => a._id);
    const repUserIds = apartments.map(a => a.representativeUser).filter(Boolean);

    console.log(`🧹 Deleting existing data for agent ${RESEED_AGENT_EMAIL}...`);
    
    // Delete representative users (property owners)
    if (repUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: repUserIds } });
    }
    
    // Delete apartments, buildings, residences, and groups
    await Apartment.deleteMany({ agent: agentId });
    await Building.deleteMany({ agent: agentId });
    await Residence.deleteMany({ agent: agentId });
    await Group.deleteMany({ managers: agentId });

    console.log("🏗️ Creating new structure...");

    // 2. Create Standalone Building (immeuble)
    const standaloneBuilding = new Building({
      building_name: "عمارة الياسمين", 
      building_address: "حي الرياض، الرباط",
      union_type: "immeuble",
      agent: agentId,
      total_units: 1,
    });
    await standaloneBuilding.save();

    // Create 1 apartment for standalone building
    const standaloneApt = new Apartment({
      unit_code: "A1",
      main_plot_number: "TF12345/R",
      building: standaloneBuilding._id,
      agent: agentId,
      owners: [{
        firstName: "Yahya",
        lastName: "FreeNinja",
        nationalId: "AB123456",
        email: "yahyafreeninja@gmail.com",
        isRepresentative: true,
        phone: "+212600000000"
      }]
    });
    await standaloneApt.save();
    standaloneBuilding.apartments.push(standaloneApt._id);
    await standaloneBuilding.save();

    // 3. Create Residence "AL NAKHILE" (الـنخيل)
    const nakhileResidence = new Residence({
      name: "إقامة النخيل", 
      address: "المنطقة السياحية، مراكش",
      city: "Marrakech",
      agent: agentId,
      description: "إقامة فاخرة تتميز بهدوئها ومساحاتها الخضراء واسعة",
      facilities: ["مسبح", "حراسة 24/24", "مرآب خاص", "حدائق"],
      totalUnits: 2,
      occupiedUnits: 2,
      status: "active"
    });
    await nakhileResidence.save();

    // 4. Create 2 buildings inside the residence
    const residenceBuilding1 = new Building({
      building_name: "عمارة النخيل A", 
      building_address: nakhileResidence.address,
      union_type: "residence",
      residence: nakhileResidence._id,
      agent: agentId,
      total_units: 1,
    });
    await residenceBuilding1.save();

    const residenceBuilding2 = new Building({
      building_name: "عمارة النخيل B", 
      building_address: nakhileResidence.address,
      union_type: "residence",
      residence: nakhileResidence._id,
      agent: agentId,
      total_units: 1,
    });
    await residenceBuilding2.save();

    // Add 1 apartment to each residence building
    const apt1 = new Apartment({
      unit_code: "B1",
      main_plot_number: "TF99999/M",
      building: residenceBuilding1._id,
      agent: agentId,
      owners: [{
        firstName: "Agent",
        lastName: "Owner",
        nationalId: "CIN123",
        email: "agent@owner.com",
        isRepresentative: true
      }]
    });
    await apt1.save();
    residenceBuilding1.apartments.push(apt1._id);
    await residenceBuilding1.save();

    const apt2 = new Apartment({
      unit_code: "C1",
      main_plot_number: "TF88888/M",
      building: residenceBuilding2._id,
      agent: agentId,
      owners: [{
        firstName: "Test",
        lastName: "User",
        nationalId: "CIN456",
        email: "test@owner.com",
        isRepresentative: true
      }]
    });
    await apt2.save();
    residenceBuilding2.apartments.push(apt2._id);
    await residenceBuilding2.save();

    console.log("✨ Seeding completed successfully!");
    console.log("- Standalone: عمارة الياسمين");
    console.log("- Residence: إقامة النخيل (with 2 buildings)");
    
    mongoose.connection.close();
  } catch (error) {
    console.error("❌ Reseed failed:", error);
    process.exit(1);
  }
}

reseed();
