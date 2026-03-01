import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  message_en: String,
  type: {
    type: String,
    enum: [
      "document",
      "payment",
      "maintenance",
      "meeting",
      "alert",
      "info",
      "success",
      "warning",
      "error",
    ],
    default: "info",
  },
  reference_id: { type: mongoose.Schema.Types.ObjectId },
  reference_type: { type: String },
  priority: {
    type: String,
    enum: ["low", "normal", "high", "critical"],
    default: "normal",
  },
  status: {
    type: String,
    enum: ["unread", "read"],
    default: "unread",
  },
  metadata: { type: mongoose.Schema.Types.Mixed },
  created_at: { type: Date, default: Date.now },
});

export default mongoose.model("Notification", NotificationSchema);
