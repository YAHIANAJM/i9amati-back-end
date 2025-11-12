import express from "express";
import { auth } from "../middleware/auth.js";
import Financial from "../models/Financial.js";
import User from "../models/User.js";
import Building from "../models/Building.js";
import { validatePaymentsQuery } from "../validationSchemas/validatePagination.js";

const router = express.Router();

// List financial records for current user context with pagination and type filtering
router.get("/", auth, async (req, res) => {
  try {
    // Validate query parameters including pagination and type
    const { page = 1, limit = 10 } = validatePaymentsQuery.parse(req.query);

    const role = req.user.role;
    let query = {
      type: req.query.type || "PAYMENT", // Use the validated type parameter (defaults to PAYMENT)
    };

    if (role === "union_agent") {
      // Get buildings where the current user is the agent
      const buildings = await Building.find({ agent: req.user.id }).lean();

      // Get all apartments from the agent's buildings
      const apartments = [];
      for (const building of buildings) {
        apartments.push(...building.apartments);
      }

      query.apartment_id = { $in: apartments };
    } else if (role === "property_owner") {
      const user = await User.findById(req.user.id);
      if (user?.apartment) {
        query.$or = [{ owner_id: user._id }, { apartment_id: user.apartment }];
      } else {
        query.owner_id = user?._id;
      }
    }

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Get total count for pagination metadata
    const totalCount = await Financial.countDocuments(query);

    // Get paginated financial records
    const financialRecords = await Financial.find(query)
      .sort({ due_date: -1 })
      .skip(skip)
      .limit(limit);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: financialRecords,
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords: totalCount,
        recordsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      filters: {
        type: req.query.type || "PAYMENT",
      },
    });
  } catch (error) {
    if (error.name === "ZodError") {
      return res.status(400).json({
        success: false,
        error: "Invalid query parameters",
        details: error.errors,
      });
    }

    console.error("Error fetching financial records:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve financial records",
    });
  }
});

// Get summary statistics for financial records
router.get("/summary", auth, async (req, res) => {
  try {
    const role = req.user.role;
    let matchQuery = {};

    // Apply role-based filtering
    if (role === "union_agent") {
      // Get buildings where the current user is the agent
      const buildings = await Building.find({ agent: req.user.id }).lean();

      // Get all apartments from the agent's buildings
      const apartments = [];
      for (const building of buildings) {
        apartments.push(...building.apartments);
      }

      matchQuery.apartment_id = { $in: apartments };
    } else if (role === "property_owner") {
      const user = await User.findById(req.user.id);
      if (user?.apartment) {
        matchQuery.$or = [
          { owner_id: user._id },
          { apartment_id: user.apartment },
        ];
      } else {
        matchQuery.owner_id = user?._id;
      }
    }

    // Aggregate financial records for summary
    const summary = await Financial.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { type: "$type", status: "$status" },
          totalAmount: { $sum: "$amount" },
        },
      },
      {
        $group: {
          _id: "$_id.type",
          statuses: {
            $push: {
              status: "$_id.status",
              totalAmount: "$totalAmount",
            },
          },
          totalAmountByType: { $sum: "$totalAmount" },
        },
      },
    ]);

    // Process the aggregation result into the expected format
    let totalRecords = 0;
    let totalAmount = 0;
    const typeBreakdown = {
      PAYMENT: { count: 0, totalAmount: 0 },
      CONTRIBUTION: { count: 0, totalAmount: 0 },
      EXPENSE: { count: 0, totalAmount: 0 },
    };
    const statusBreakdown = {
      PENDING: { count: 0, totalAmount: 0 },
      PAID: { count: 0, totalAmount: 0 },
      OVERDUE: { count: 0, totalAmount: 0 },
    };

    // Process each type group from aggregation
    for (const typeGroup of summary) {
      const type = typeGroup._id;
      const typeTotalAmount = typeGroup.totalAmountByType || 0;

      // Update type breakdown
      typeBreakdown[type] = {
        count: typeGroup.statuses.length, // Number of status entries = number of records
        totalAmount: typeTotalAmount,
      };

      // Update total counters
      totalRecords += typeGroup.statuses.length;
      totalAmount += typeTotalAmount;

      // Process status breakdown
      for (const statusEntry of typeGroup.statuses) {
        const status = statusEntry.status;
        const statusAmount = statusEntry.totalAmount || 0;

        statusBreakdown[status].count += 1;
        statusBreakdown[status].totalAmount += statusAmount;
      }
    }

    const result = {
      totalRecords,
      totalAmount: Math.round(totalAmount * 100) / 100, // Round to 2 decimals
      typeBreakdown,
      statusBreakdown,
    };

    res.json({
      success: true,
      data: result,
      metadata: {
        userRole: role,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching payment summary:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve payment summary",
    });
  }
});

export default router;
