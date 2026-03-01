import express from "express";
import { auth } from "../middleware/auth.js";
import Notification from "../models/Notification.js";

const router = express.Router();

/**
 * GET /api/notifications - List notifications for current user
 */
router.get("/", auth, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.id })
      .sort({ created_at: -1 })
      .limit(50);

    res.json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/notifications/:id/read - Mark notification as read
 */
router.put("/:id/read", auth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { status: "read" },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json(notification);
  } catch (error) {
    console.error("Error updating notification:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/notifications/read-all - Mark all as read
 */
router.put("/read-all", auth, async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user.id, status: "unread" },
      { status: "read" },
    );

    res.json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    console.error("Error updating all notifications:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
