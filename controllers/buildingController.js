// ========================================
// FILE 1: backend/controllers/buildingController.js
// ========================================
import Building from '../models/Building.js';
import Apartment from '../models/Apartment.js';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import Group from '../models/Group.js'; // ✅ ADD THIS at the top with other imports
import crypto from 'crypto';
import mongoose from 'mongoose';
/**
 * GET /api/union/buildings
 * Get all buildings with pagination (10 per page)
 * Returns only building details, NO apartments populated
 */
export const getBuildings = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get buildings and total count in parallel
    const [buildings, totalCount] = await Promise.all([
      Building.find()
        .select('name address residenceCode estateFeeNumber totalUnits numberOfBuildings createdAt')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }) // Newest first
        .lean(),
      Building.countDocuments()
    ]);

    res.status(200).json({
      success: true,
      data: buildings,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalBuildings: totalCount,
        buildingsPerPage: limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Error fetching buildings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve buildings',
      error: error.message
    });
  }
};

/**
 * GET /api/union/buildings/:buildingId
 * Get single building by ID
 */
export const getBuildingById = async (req, res) => {
  try {
    const { buildingId } = req.params;
    
    const building = await Building.findById(buildingId).lean();
    
    if (!building) {
      return res.status(404).json({
        success: false,
        message: 'Building not found'
      });
    }

    res.status(200).json({
      success: true,
      data: building
    });

  } catch (error) {
    console.error('Error fetching building:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve building',
      error: error.message
    });
  }
};

/**
 * POST /api/union/buildings/createBuildingWithApartmentAndOwners
 * Create building + apartment + owners in one transaction
 */

export const createBuildingWithApartmentAndOwners = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1️⃣ Get the authenticated union agent user
    const agent = await User.findById(req.user.id).session(session);
    if (!agent) throw new Error("Agent user not found");

    const { building, apartment, owners } = req.body;

    if (!building || !apartment || !Array.isArray(owners) || owners.length === 0) {
      throw new Error("Building, apartment, and at least one owner are required");
    }

    // 2️⃣ Create building
    const buildingData = {
      name: building.name?.trim(),
      address: building.address?.trim(),
      residenceCode: building.residenceCode?.trim(),
      propertyLandArea: building.propertyLandArea ? parseFloat(building.propertyLandArea) : undefined,
      numberOfBuildings: building.numberOfBuildings ? parseInt(building.numberOfBuildings, 10) : undefined,
      averageUnitsPerBuilding: building.averageUnitsPerBuilding ? parseInt(building.averageUnitsPerBuilding, 10) : undefined,
      averageFloorsPerBuilding: building.averageFloorsPerBuilding ? parseInt(building.averageFloorsPerBuilding, 10) : undefined,
      totalUnits: building.totalUnits ? parseInt(building.totalUnits, 10) : undefined,
      propertyPlanNumber: building.propertyPlanNumber?.trim(),
      hasGarage: building.hasGarage === true || building.hasGarage === 'true' || building.hasGarage === 'yes',
      hasSwimmingPool: building.hasSwimmingPool === true || building.hasSwimmingPool === 'true' || building.hasSwimmingPool === 'yes',
      sharedParts: building.sharedParts?.trim(),
      description: building.description?.trim(),
      agent: agent._id, // Use the authenticated agent's ObjectId
      residenceManager: building.residenceManager?.trim(),
      mainOwner: building.mainOwner?.trim() || null
    };

    const newBuilding = new Building(buildingData);
    await newBuilding.save({ session });

    // 3️⃣ Create apartment
    const apartmentData = {
      number: apartment.apartment_number?.trim(),
      apartment_number: apartment.apartment_number?.trim(),
      floor: apartment.floor ? parseInt(apartment.floor, 10) : undefined,
      space: apartment.space ? parseFloat(apartment.space) : undefined,
      name: apartment.name?.trim() || `${building.name} ${apartment.apartment_number}`,
      type: apartment.type?.trim() || 'residential',
      agent: agent._id,
      building: newBuilding._id,
      owners: [],
      ownerCredentials: []
    };

    const newApartment = new Apartment(apartmentData);
    await newApartment.save({ session });

    // 4️⃣ Create owners
    const createdOwners = [];
    const ownerUserIds = [];

    for (const owner of owners) {
      if (!owner.firstName || !owner.lastName) continue;

      const firstName = owner.firstName.trim();
      const lastName = owner.lastName.trim();
      const fullName = `${firstName} ${lastName}`;

      const emailLocal = `${apartmentData.apartment_number.toLowerCase()}.${newBuilding.name.toLowerCase()}.${firstName.toLowerCase()}`
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9.\-@]/g, '');
      const email = `${emailLocal}@owner.com`;

      const existingUser = await User.findOne({ email }).session(session);
      if (existingUser) throw new Error(`Owner email already exists: ${email}`);

      const rawPassword = owner.nationalId?.trim();
      if (!rawPassword) throw new Error(`National ID required for owner: ${fullName}`);

      const newUser = new User({
        name: fullName,
        email,
        password_hash: rawPassword, // plain password = national ID
        nationalId: owner.nationalId?.trim(),
        role: 'property_owner',
        apartment: newApartment._id, // single apartment
        status: 'ACTIVE'
      });

      await newUser.save({ session });

      // Link to apartment
      newApartment.owners.push(newUser._id);
      newApartment.ownerCredentials.push({ owner: newUser._id, email, password: rawPassword });
      ownerUserIds.push(newUser._id);

      createdOwners.push({ name: fullName, email, password: rawPassword });
    }

    await newApartment.save({ session });

    // 5️⃣ Link apartment to building
    newBuilding.apartments.push(newApartment._id);
    await newBuilding.save({ session });

    // 6️⃣ Link apartment to agent user
    if (!agent.apartments) agent.apartments = [];
    agent.apartments.push(newApartment._id);
    await agent.save({ session });

    // 7️⃣ Create private group
    const groupName = `${buildingData.name} - Private Group`;
    const groupDescription = `Private discussion group for residents of ${buildingData.name}`;

    const newGroup = new Group({
      name: groupName,
      description: groupDescription,
      managers: [req.user.id],
      is_active: true
    });

    await newGroup.save({ session });

    await User.updateMany(
      { _id: { $in: ownerUserIds } },
      { $push: { groups: newGroup._id } },
      { session }
    );

    // ✅ Commit transaction
    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: 'Building, apartment, owners, and private group created successfully',
      building: newBuilding,
      apartment: newApartment,
      owners: createdOwners,
      group: { _id: newGroup._id, name: newGroup.name, description: newGroup.description }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error in createBuildingWithApartmentAndOwners:', error);
    res.status(500).json({ error: error.message || 'Failed to create building setup' });
  }
};


/**
 * DELETE /api/union/buildings/:buildingId
 * Delete building and all its apartments
 */
export const deleteBuilding = async (req, res) => {
  try {
    const { buildingId } = req.params;
    
    // Get the authenticated user (who should be a union agent)
    const agent = await User.findById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent user not found' });

    const building = await Building.findById(buildingId);
    if (!building) {
      return res.status(404).json({ error: 'Building not found' });
    }

    // Get all apartments in this building
    const apartments = await Apartment.find({ building: buildingId });
    const aptIds = apartments.map(a => a._id);

    // Collect owner/resident ids
    const userIds = [];
    for (const a of apartments) {
      if (Array.isArray(a.owners)) userIds.push(...a.owners.map(x => x.toString()));
      if (Array.isArray(a.residents)) userIds.push(...a.residents.map(x => x.toString()));
    }

    // Remove apartments
    await Apartment.deleteMany({ _id: { $in: aptIds } });

    // Remove users
    if (userIds.length > 0) {
      const uniqueUserIds = [...new Set(userIds)];
      await User.deleteMany({ _id: { $in: uniqueUserIds } });
    }

    // Remove building
    await Building.findByIdAndDelete(buildingId);

    // Remove references from agent user
    if (agent.apartments) {
      agent.apartments = agent.apartments.filter(aid => 
        !aptIds.some(x => x.toString() === aid.toString())
      );
      await agent.save();
    }

    res.json({ 
      success: true, 
      deletedApartments: aptIds.length, 
      deletedUsers: userIds.length 
    });

  } catch (error) {
    console.error('Error deleting building:', error);
    res.status(500).json({ error: 'Failed to delete building' });
  }
};