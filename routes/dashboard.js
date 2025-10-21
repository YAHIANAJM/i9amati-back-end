import express from 'express';
import { auth } from '../middleware/auth.js';
import Unit from '../models/Unit.js';
import Apartment from '../models/Apartment.js';
import Financial from '../models/Financial.js';
import Alert from '../models/Alert.js';
import Meeting from '../models/Meeting.js';

const router = express.Router();

router.get('/summary', auth, async (_req, res) => {
  const now = new Date();

  const [unitCount, apartmentCount] = await Promise.all([
    Unit.countDocuments(),
    Apartment.countDocuments()
  ]);
  const totalUnits = unitCount || apartmentCount || 0;

  const totalPayments = await Financial.countDocuments({ type: { $in: ['CONTRIBUTION', 'PAYMENT'] } });
  const paidPayments = await Financial.countDocuments({ type: { $in: ['CONTRIBUTION', 'PAYMENT'] }, status: 'PAID' });
  const collectionRate = totalPayments > 0 ? Math.round((paidPayments / totalPayments) * 100) : 0;

  const openComplaints = await Alert.countDocuments({ status: 'NEW' });
  const upcomingMeetings = await Meeting.countDocuments({ status: 'PLANNED', scheduled_at: { $gte: now } });

  res.json({ totalUnits, collectionRate, openComplaints, upcomingMeetings });
});

export default router;


