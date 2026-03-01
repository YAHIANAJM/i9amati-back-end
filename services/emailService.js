import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

/**
 * Email Service
 * Handles sending emails via SMTP
 */
class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  /**
   * Send an email
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {string} options.text - Plain text content
   * @param {string} options.html - HTML content
   */
  async sendEmail({ to, subject, text, html }) {
    console.log(`[SMTP] ⏳ Processing SMTP for: ${to}`);
    try {
      const mailOptions = {
        from: process.env.SMTP_FROM,
        to,
        subject,
        text,
        html,
      };
      console.log(
        `[SMTP] 📋 ACTUAL MAIL OPTIONS: To: ${mailOptions.to}, From: ${mailOptions.from}, Subject: ${mailOptions.subject}`,
      );
      const info = await this.transporter.sendMail(mailOptions);

      console.log(`[SMTP] ✅ Sent SMTP! MessageId: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`[SMTP] ❌ Failed to send SMTP to ${to}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send document upload notification email
   * @param {Object} user - User to notify
   * @param {Object} document - Document that was uploaded
   */
  async sendDocumentNotification(user, document) {
    const subject = `I9amati: New Document Uploaded - ${document.title}`;

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #4f46e5;">New Document Notification</h2>
        <p>Hello ${user.name},</p>
        <p>A new document has been uploaded to the I9amati platform that requires your attention.</p>
        
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Title:</strong> ${document.title}</p>
          <p><strong>Category:</strong> ${document.category}</p>
          <p><strong>Description:</strong> ${document.description || "No description provided"}</p>
        </div>
        
        <p>You can view this document by logging into your dashboard.</p>
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="${process.env.FRONTEND_URL}/documents" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">View Documents</a>
        </div>
        
        <hr style="margin-top: 40px; border: 0; border-top: 1px solid #eee;" />
        <p style="font-size: 12px; color: #6b7280; text-align: center;">
          This is an automated notification from the I9amati Platform.
        </p>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject,
      text: `New document uploaded: ${document.title}. Visit ${process.env.FRONTEND_URL}/documents to view it.`,
      html,
    });
  }
}

export default new EmailService();
