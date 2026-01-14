import express from 'express';
import { auth } from '../middleware/auth.js';
import Unit from '../models/Unit.js';
import Apartment from '../models/Apartment.js';
import Financial from '../models/Financial.js';
import Alert from '../models/Alert.js';
import Meeting from '../models/Meeting.js';
import Building from '../models/Building.js';
import User from '../models/User.js';

const router = express.Router();

router.get('/summary', auth, async (_req, res) => {
  const now = new Date();

  const [
    unitCount,
    apartmentCount,
    buildingCount,
    ownerCount,
    complaintCount,
    meetingCount,
    financialStats
  ] = await Promise.all([
    Unit.countDocuments(),
    Apartment.countDocuments(),
    Building.countDocuments(),
    User.countDocuments({ role: 'property_owner' }),
    Alert.countDocuments({ status: { $ne: 'RESOLVED' } }),
    Meeting.countDocuments({ status: 'PLANNED', scheduled_at: { $gte: now } }),
    Financial.aggregate([
      { $match: { type: { $in: ['CONTRIBUTION', 'PAYMENT'] } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          paid: { $sum: { $cond: [{ $eq: ["$status", "PAID"] }, 1, 0] } }
        }
      }
    ])
  ]);
  const totalUnits = unitCount || apartmentCount || 0;

  // Calculate Collection Rate
  const stats = financialStats[0] || { total: 0, paid: 0 };
  const collectionRate = stats.total > 0 ? Math.round((stats.paid / stats.total) * 100) : 0;

  res.json({
    totalBuildings: buildingCount,
    totalApartments: totalUnits,
    totalOwners: ownerCount,
    complaintsCount: complaintCount,
    meetingsCount: meetingCount,

    // Legacy support
    totalUnits,
    collectionRate,
    openComplaints: complaintCount,
    upcomingMeetings: meetingCount
  });
});

router.get('/charts', auth, async (_req, res) => {
  try {
    // 1. Occupancy Rate
    const totalApartments = await Apartment.countDocuments();
    const occupiedApartments = await Apartment.countDocuments({
      representativeUser: { $ne: null }
    });

    // 2. Complaint Status
    const complaintStats = await Alert.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    // 3. Payment Trends (Last 6 Months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5); // Include current month
    sixMonthsAgo.setDate(1);

    const paymentTrends = await Financial.aggregate([
      {
        $match: {
          type: { $in: ['CONTRIBUTION', 'PAYMENT'] },
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            month: { $month: "$createdAt" },
            year: { $year: "$createdAt" }
          },
          totalAmount: { $sum: "$amount" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    // 4. Platform Growth (Historical)
    const getGrowthData = async (Model, query = {}) => {
      const baseline = await Model.countDocuments({ ...query, createdAt: { $lt: sixMonthsAgo } });
      const monthlyAdditions = await Model.aggregate([
        { $match: { ...query, createdAt: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            count: { $sum: 1 }
          }
        }
      ]);
      return { baseline, monthlyAdditions };
    };

    const [
      buildingsData,
      apartmentsData,
      ownersData
    ] = await Promise.all([
      getGrowthData(Building),
      getGrowthData(Apartment),
      getGrowthData(User, { role: 'property_owner' })
    ]);

    const growth = [];
    let bTotal = buildingsData.baseline;
    let aTotal = apartmentsData.baseline;
    let oTotal = ownersData.baseline;

    for (let i = 0; i < 6; i++) {
      const d = new Date(sixMonthsAgo);
      d.setMonth(d.getMonth() + i);
      const monthNum = d.getMonth() + 1;
      const yearNum = d.getFullYear();
      const monthLabel = d.toLocaleString('default', { month: 'short' });

      const bAdded = buildingsData.monthlyAdditions.find(m => m._id.year === yearNum && m._id.month === monthNum)?.count || 0;
      const aAdded = apartmentsData.monthlyAdditions.find(m => m._id.year === yearNum && m._id.month === monthNum)?.count || 0;
      const oAdded = ownersData.monthlyAdditions.find(m => m._id.year === yearNum && m._id.month === monthNum)?.count || 0;

      bTotal += bAdded;
      aTotal += aAdded;
      oTotal += oAdded;

      growth.push({
        month: monthLabel,
        buildings: bTotal,
        apartments: aTotal,
        owners: oTotal
      });
    }

    res.json({
      occupancy: {
        total: totalApartments,
        occupied: occupiedApartments,
        vacant: totalApartments - occupiedApartments
      },
      complaints: complaintStats.map(s => ({ status: s._id, count: s.count })),
      payments: paymentTrends.map(p => ({
        date: `${p._id.year}-${p._id.month}`,
        amount: p.totalAmount
      })),
      growth // [NEW] Historical data
    });
  } catch (error) {
    console.error("Dashboard Charts Error:", error);
    res.status(500).json({ message: "Error fetching chart data" });
  }
});

export default router;


