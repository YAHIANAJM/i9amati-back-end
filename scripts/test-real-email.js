// scripts/test-real-email.js
import emailService from "../services/emailService.js";
import dotenv from "dotenv";

dotenv.config();

const TARGET_EMAIL = "yahyafreeninja@gmail.com";

async function testEmail() {
  console.log(`Sending real test email to ${TARGET_EMAIL}...`);
  const result = await emailService.sendEmail({
    to: TARGET_EMAIL,
    subject: "I9amati — اختبار إرسال البريد الإلكتروني",
    text: "هذا بريد إلكتروني تجريبي من منصة I9amati للتأكد من وصول التنبيهات إليكم.",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #eee;border-radius:10px;direction:rtl">
        <h2 style="color:#0d9488;text-align:center">اختبار منصة إقامتي</h2>
        <p>مرحباً يحيى،</p>
        <p>هذا بريد إلكتروني تجريبي (Test Email) لتأكيد أن نظام التنبيهات يعمل بشكل صحيح.</p>
        <p>المرسل هو: <strong>${process.env.SMTP_FROM}</strong></p>
        <hr style="margin-top:40px;border:0;border-top:1px solid #eee"/>
        <p style="font-size:12px;color:#6b7280;text-align:center">I9amati Platform — Automatic Test</p>
      </div>
    `
  });

  if (result.success) {
    console.log("✅ Email sent successfully! MessageId:", result.messageId);
  } else {
    console.error("❌ Email failed:", result.error);
  }
}

testEmail();
