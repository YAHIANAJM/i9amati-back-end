import express from 'express';
import { auth } from '../middleware/auth.js';
import Financial from '../models/Financial.js';
import User from '../models/User.js';

const router = express.Router();

// List payments for current user context
router.get('/', auth, async (req, res) => {
  const role = req.user.role;
  let query = {};

  if (role === 'union_agent') {
    const agent = await UnionAgent.findOne({ user: req.user.id });
    if (!agent) return res.json([]);
    query.apartment_id = { $in: agent.apartments };
  } else if (role === 'property_owner') {
    const user = await User.findById(req.user.id);
    if (user?.apartment) {
      query.$or = [{ owner_id: user._id }, { apartment_id: user.apartment }];
    } else {
      query.owner_id = user?._id;
    }
  }

  const payments = await Financial.find(query).sort({ due_date: -1 });
  res.json(payments);
});

export default router;



