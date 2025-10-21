import express from 'express';
import { auth } from '../middleware/auth.js';
import Alert from '../models/Alert.js';

const router = express.Router();

// List alerts with optional filters
router.get('/', auth, async (req, res) => {
  const { category, priority, status, isRead, actionRequired } = req.query;
  const query = {};
  if (category) query.category = category.toUpperCase();
  if (priority) query.priority = priority;
  if (status) query.status = status.toUpperCase();
  if (isRead !== undefined) query.isRead = isRead === 'true';
  if (actionRequired !== undefined) query.actionRequired = actionRequired === 'true';
  const alerts = await Alert.find(query).sort({ created_at: -1 });
  res.json(alerts);
});

// Update complaint/alert status (e.g., NEW -> RESOLVED)
router.put('/:id/status', auth, async (req, res) => {
  const { status } = req.body;
  if (!['NEW','RESOLVED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const update = { status };
  if (status === 'RESOLVED') update.resolved_at = new Date();
  const alert = await Alert.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json(alert);
});

// Mark as read
router.put('/:id/read', auth, async (req, res) => {
  const alert = await Alert.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true });
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json(alert);
});

// Toggle action required
router.put('/:id/action', auth, async (req, res) => {
  const { actionRequired } = req.body;
  const alert = await Alert.findByIdAndUpdate(
    req.params.id,
    { actionRequired: !!actionRequired },
    { new: true }
  );
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json(alert);
});

export default router;


