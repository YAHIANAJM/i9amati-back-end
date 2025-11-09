// ========================================
// FILE 1: backend/controllers/buildingController.js
// ========================================
import Building from '../models/Building.js';
import Apartment from '../models/Apartment.js';
import User from '../models/User.js';
import UnionAgent from '../models/UnionAgent.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

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
  try {
    const agent = await UnionAgent.findOne({ user: req.user.id });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { building, apartment, owners } = req.body;

    if (!building || !apartment || !Array.isArray(owners) || owners.length === 0) {
      return res.status(400).json({ error: 'Building, apartment, and at least one owner are required' });
    }

    // === 1️⃣ Parse and sanitize building data ===
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
      estateFeeNumber: building.estateFeeNumber?.trim(),
      agent: {
        name: building.agent?.name?.trim() || '',
        company: building.agent?.company?.trim() || ''
      },
      residenceManager: building.residenceManager?.trim(),
      mainOwner: building.mainOwner?.trim() || null
    };

    if (!buildingData.name) {
      return res.status(400).json({ error: 'Building name is required' });
    }

    // === 2️⃣ Create Building ===
    const newBuilding = new Building(buildingData);
    await newBuilding.save();

    // === 3️⃣ Create Apartment ===
    const apartmentData = {
      apartment_number: apartment.apartment_number?.trim(),
      floor: apartment.floor ? parseInt(apartment.floor, 10) : undefined,
      space: apartment.space ? parseFloat(apartment.space) : undefined,
      name: apartment.name?.trim() || `${building.name} ${apartment.apartment_number}`,
      type: apartment.type?.trim() || 'residential',
      agent: agent._id,
      building: newBuilding._id
    };

    if (!apartmentData.apartment_number) {
      return res.status(400).json({ error: 'Apartment number is required' });
    }

    const newApartment = new Apartment(apartmentData);
    await newApartment.save();

    // === 4️⃣ Create Owners ===
    const createdOwners = [];

    for (const owner of owners) {
      if (!owner.firstName || !owner.lastName) {
        continue; // skip invalid
      }

      const firstName = owner.firstName.trim();
      const lastName = owner.lastName.trim();
      const fullName = `${firstName} ${lastName}`;

      // Generate email & username
      const emailLocal = `${apartmentData.apartment_number.toLowerCase()}.${newBuilding.name.toLowerCase()}.${firstName.toLowerCase()}`.replace(/\s+/g, '').replace(/[^a-z0-9.\-@]/g, '');
      const email = `${emailLocal}@owner.com`;
      const username = emailLocal;

      // Check email uniqueness
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(409).json({ error: `Owner email already exists: ${email}` });
      }

      // Generate password
      const rawPassword = crypto.randomBytes(6).toString('hex');
      const passwordHash = await bcrypt.hash(rawPassword, 10);

      // Create user
      const newUser = new User({
        firstName,
        lastName,
        email,
        password_hash: passwordHash,
        nationalId: owner.nationalId?.trim(),
        role: 'property_owner',
        apartment: newApartment._id,
        status: 'ACTIVE'
      });

      await newUser.save();

      // Link to apartment
      newApartment.owners.push(newUser._id);

      createdOwners.push({
        name: fullName,
        email,
        password: rawPassword
      });
    }

    // Save apartment with owners
    await newApartment.save();

    // Link apartment to building
    newBuilding.apartments.push(newApartment._id);
    await newBuilding.save();

    // Also link to agent
    agent.apartments.push(newApartment._id);
    await agent.save();

    // === 🎉 Success ===
    res.status(201).json({
      message: 'Building, apartment, and owners created successfully',
      building: newBuilding,
      apartment: newApartment,
      owners: createdOwners
    });

  } catch (error) {
    console.error('Error in createBuildingWithApartmentAndOwners:', error);
    res.status(500).json({ error: 'Failed to create building setup' });
  }
};

/**
 * DELETE /api/union/buildings/:buildingId
 * Delete building and all its apartments
 */
export const deleteBuilding = async (req, res) => {
  try {
    const { buildingId } = req.params;
    const agent = await UnionAgent.findOne({ user: req.user.id });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

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

    // Remove references from agent
    agent.apartments = (agent.apartments || []).filter(aid => !aptIds.some(x => x.toString() === aid.toString()));
    await agent.save();

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