// scripts/test-shared-parts-notification.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import Building from "../models/Building.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import Apartment from "../models/Apartment.js";
import Group from "../models/Group.js";
import bcrypt from "bcryptjs";

dotenv.config();

const SENDER_AGENT_EMAIL = "agent@iqamati.ma";
const TARGET_PLAN_NUMBER = "PLAN-YA-999";

// Mock notifySharedParts if needed, or just let it run if dependencies are met
// The actual notifySharedParts is in buildingController.js, but we can't easily import it without its closure.
// However, we can just run the logic manually or import it if exported.
// Since it's NOT exported, I will copy the logic here for the test script.

import emailService from "../services/emailService.js";

async function notifySharedParts(recipientAgentId, newBuilding, theirBuilding) {
  try {
    const agent = await User.findById(recipientAgentId).select("name email");
    if (!agent) return;

    const newBldName   = newBuilding.building_name || "عمارة جديدة";
    const theirBldName = theirBuilding.building_name || "عمارتكم";

    // 1. In-app notification
    await Notification.create({
      user:           agent._id,
      title:          "أجزاء مشتركة مع عمارة مجاورة",
      message:        `تفيدكم إدارة "${newBldName}" (رسم عقاري: ${newBuilding.propertyPlanNumber}) بأن لديها أجزاء مشتركة مع "${theirBldName}". يرجى مراجعة قسم الوثائق ورفع الوثيقة القانونية المثبتة لذلك.`,
      type:           "document",
      priority:       "high",
      reference_id:   newBuilding._id,
      reference_type: "Building",
    });

    // 2. Real Email
    await emailService.sendEmail({
      to: agent.email,
      subject: `I9amati — أجزاء مشتركة: "${newBldName}"`,
      text: `مرحباً ${agent.name}،\n\nتفيدكم إدارة "${newBldName}" بأن لديها أجزاء مشتركة مع "${theirBldName}".\nيرجى تسجيل الدخول إلى المنصة ورفع الوثيقة القانونية في قسم الوثائق.`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #eee;border-radius:10px;direction:rtl">
          <h2 style="color:#0d9488">إشعار: أجزاء مشتركة</h2>
          <p>مرحباً <strong>${agent.name}</strong>،</p>
          <p>تفيدكم إدارة <strong>"${newBldName}"</strong> بأن لديها أجزاء مشتركة مع <strong>"${theirBldName}"</strong>.</p>
          <p>يرجى تسجيل الدخول إلى المنصة ورفع الوثيقة القانونية المثبتة لذلك في قسم الوثائق.</p>
          <hr style="margin-top:40px;border:0;border-top:1px solid #eee"/>
          <p style="font-size:12px;color:#6b7280;text-align:center">I9amati Platform — Automatic Test</p>
        </div>`
    });

    console.log(`[Test] In-app & Email notification sent to ${agent.email}`);
  } catch (err) {
    console.warn("[Test] Notification failed:", err.message);
  }
}

async function runTest() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB...");

    const senderAgent = await User.findOne({ email: SENDER_AGENT_EMAIL });
    const targetBuilding = await Building.findOne({ propertyPlanNumber: TARGET_PLAN_NUMBER });

    if (!targetBuilding) throw new Error("Target building not found. Run setup first.");
    if (!senderAgent) throw new Error("Sender agent not found.");

    console.log(`Simulating building creation by ${SENDER_AGENT_EMAIL} sharing parts with ${TARGET_PLAN_NUMBER}...`);

    // Create a new building for sender
    const newBuilding = new Building({
       building_name: "عمارة الاختبار المتبادل",
       propertyPlanNumber: "PLAN-TEST-777",
       sharedWithTitleDeed: TARGET_PLAN_NUMBER,
       agent: senderAgent._id,
       hasSharedParts: true,
       union_type: "immeuble"
    });
    await newBuilding.save();

    // Trigger the notification logic manually as it happens in the controller
    if (targetBuilding.agent) {
       await notifySharedParts(targetBuilding.agent, newBuilding, targetBuilding);
    }

    // Also update the target building to show it's linked (as the controller does)
    await Building.findByIdAndUpdate(targetBuilding._id, {
        hasSharedParts: true,
        sharedWithTitleDeed: "PLAN-TEST-777"
    });

    console.log("✅ Test completed. Check notifications for yahyafreeninja@gmail.com");
    mongoose.connection.close();
  } catch (err) {
    console.error("❌ Test failed:", err);
    process.exit(1);
  }
}

runTest();
