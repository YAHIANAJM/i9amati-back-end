import express from 'express';
import Service from '../models/Service.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// List services (optionally filter by status/type)
router.get('/', auth, async (req, res) => {
  const { status, type } = req.query;
  const query = {};
  if (status) query.status = status.toUpperCase();
  if (type) query.type = type.toUpperCase();
  const services = await Service.find(query).sort({ _id: -1 });
  res.json(services);
});

// Update a service
router.put('/:id', auth, async (req, res) => {
  const allowed = ['type','provider','schedule','status','reports'];
  const update = {};
  for (const key of allowed) if (key in req.body) update[key] = req.body[key];
  const svc = await Service.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!svc) return res.status(404).json({ error: 'Service not found' });
  res.json(svc);
});

export default router;


