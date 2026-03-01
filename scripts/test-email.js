import dotenv from "dotenv";
import emailService from "../services/emailService.js";

dotenv.config();

const testUser = {
  name: "Test Owner",
  email: "yahyabador@gmail.com", // I'll use a likely real email or just a placeholder for the user to try
};

const testDocument = {
  title: "Test Building Report",
  category: "Legal",
  description: "This is a test notification to verify SMTP settings.",
};

async function runTest() {
  console.log("--- SMTP Test Started ---");
  console.log("From:", process.env.SMTP_FROM);
  console.log("To:", testUser.email);

  const result = await emailService.sendDocumentNotification(
    testUser,
    testDocument,
  );

  if (result.success) {
    console.log("✅ Email sent successfully!");
    console.log("Message ID:", result.messageId);
  } else {
    console.log("❌ Email failed to send.");
    console.log("Error:", result.error);

    if (result.error.includes("auth")) {
      console.log("Check your SMTP_USER and SMTP_PASS in .env");
    }
  }
}

runTest();
