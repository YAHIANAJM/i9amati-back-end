// ========================================
// FILE 1: backend/controllers/buildingController.js
// ========================================
import Building from '../models/Building.js';
import Apartment from '../models/Apartment.js';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import Group from '../models/Group.js';
import crypto from 'crypto';
import mongoose from 'mongoose';

/**
 * GET /api/buildings
 * Get all buildings with pagination (10 per page)
 * Returns only building details, NO apartments populated
 */
export const getBuildings = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [buildings, totalCount] = await Promise.all([
      Building.find()
        .select('name address residenceCode propertyLandArea averageUnitsPerBuilding averageFloorsPerBuilding propertyPlanNumber hasGarage hasSwimmingPool sharedParts estateFeeNumber totalUnits numberOfBuildings createdAt building_code building_name building_address land_area_sqm number_of_blocks avg_units_per_block avg_floors_per_block original_title_number has_pool has_shared_parts_with_other_buildings documents description')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean(),
      Building.countDocuments()
    ]);

    // Ensure all expected fields are present in the response
    const fieldsToEnsure = [
      'propertyLandArea', 'averageUnitsPerBuilding', 'averageFloorsPerBuilding',
      'propertyPlanNumber', 'hasGarage', 'hasSwimmingPool', 'sharedParts',
      'totalUnits', 'numberOfBuildings'
    ];

    const normalizedBuildings = buildings.map(building => {
      const normalized = { ...building };
      fieldsToEnsure.forEach(field => {
        if (!(field in normalized)) {
          normalized[field] = null;
        }
      });
      return normalized;
    });

    console.log(`Fetched ${buildings.length} buildings out of ${totalCount} total.`); 

    res.status(200).json({
      success: true,
      data: normalizedBuildings,
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
 * GET /api/buildings/:id
 * Get single building by ID
 */
export const getBuildingById = async (req, res) => {
  try {
    const { id } = req.params; // Changed from buildingId to id to match frontend
    
    const building = await Building.findById(id).lean();
    
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
 * POST /api/buildings/createBuildingWithApartmentAndOwners
 * Create building + apartment + owners in one transaction
 */
export const createBuildingWithApartmentAndOwners = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1️⃣ Get the authenticated union agent user (now using User model)
    const agent = await User.findById(req.user.id).session(session);
    if (!agent || agent.role !== 'union_agent') {
      throw new Error("Agent user not found or invalid role");
    }

    const { building, apartment, owners } = req.body;

    if (!building || !apartment || !Array.isArray(owners) || owners.length === 0) {
      throw new Error("Building, apartment, and at least one owner are required");
    }

    // 2️⃣ Create building with correct field mapping
    const buildingData = {
      building_name: building.name?.trim(),
      building_code: building.residenceCode?.trim(),
      building_address: building.address?.trim(),
      residenceCode: building.residenceCode?.trim(),
      land_area_sqm: building.propertyLandArea ? parseFloat(building.propertyLandArea) : undefined,
      number_of_blocks: building.numberOfBuildings ? parseInt(building.numberOfBuildings, 10) : undefined,
      avg_units_per_block: building.averageUnitsPerBuilding ? parseInt(building.averageUnitsPerBuilding, 10) : undefined,
      avg_floors_per_block: building.averageFloorsPerBuilding ? parseInt(building.averageFloorsPerBuilding, 10) : undefined,
      total_units: building.totalUnits ? parseInt(building.totalUnits, 10) : undefined,
      original_title_number: building.propertyPlanNumber?.trim(),
      has_garage: building.hasGarage === true || building.hasGarage === 'true' || building.hasGarage === 'yes',
      has_pool: building.hasSwimmingPool === true || building.hasSwimmingPool === 'true' || building.hasSwimmingPool === 'yes',
      has_shared_parts_with_other_buildings: building.sharedParts?.trim() && building.sharedParts.trim().toLowerCase() !== 'none',
      description: building.description?.trim(),
      agent: agent._id,
    };

    const newBuilding = new Building(buildingData);
    await newBuilding.save({ session });

    // 3️⃣ Create apartment with correct field mapping
    const apartmentData = {
      unit_code: apartment.apartment_number?.trim(),
      unit_description: apartment.ownership_status?.trim(),
      registration_number: apartment.main_plot_number?.trim(),
      division_number: apartment.plot_number?.trim(), // Using plot_number as division_number
      
      area_sqm: apartment.space ? parseFloat(apartment.space) : undefined,
      floor: apartment.floor ? parseInt(apartment.floor, 10) : undefined,
      usage_type: apartment.type?.trim() || 'residential',
      
      land_share_ratio: apartment.share_percentage ? `${apartment.share_percentage}%` : undefined,
      
      building: newBuilding._id,
      agent: agent._id,
      owners: [], // Will be populated below
      ownerCredentials: [] // Will be populated below
    };

    const newApartment = new Apartment(apartmentData);
    await newApartment.save({ session });

    // 4️⃣ Create owners and link them correctly
    const createdOwners = [];
    const ownerUserIds = [];
    let representativeOwner = null;

    for (const owner of owners) {
      if (!owner.firstName || !owner.lastName) continue;

      const firstName = owner.firstName.trim();
      const lastName = owner.lastName.trim();
      const fullName = `${firstName} ${lastName}`;

      const emailLocal = `${apartmentData.unit_code.toLowerCase()}.${newBuilding.building_name.toLowerCase()}.${firstName.toLowerCase()}`
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9.\-@]/g, '');
      const email = `${emailLocal}@owner.com`;

      const existingUser = await User.findOne({ email }).session(session);
      if (existingUser) throw new Error(`Owner email already exists: ${email}`);

      // Hash the CIN as password
      const hashedPassword = await bcrypt.hash(owner.nationalId?.trim(), 10);

      const newUser = new User({
        name: fullName,
        email: email,
        password_hash: hashedPassword, // Store hashed CIN
        nationalId: owner.nationalId?.trim(),
        role: "property_owner",
        status: "ACTIVE"
      });

      await newUser.save({ session });

      // Add to apartment's owners array
      newApartment.owners.push(newUser._id);
      ownerUserIds.push(newUser._id);

      // Add owner credentials for the agent to see
      newApartment.ownerCredentials.push({
        owner: newUser._id,
        email: newUser.email,
        password: owner.nationalId?.trim() // Store plaintext CIN for agent view
      });

      // Check if this owner is the representative
      if (owner.isRepresentative) {
        if (representativeOwner) {
          console.warn(`Warning: Multiple representatives found for apartment ${apartmentData.unit_code}. Using the first one.`);
        } else {
          representativeOwner = newUser;
        }
      }

      createdOwners.push({
        name: fullName,
        email: newUser.email,
        password: owner.nationalId?.trim(),
        nationalId: owner.nationalId?.trim(),
        isRepresentative: owner.isRepresentative
      });
    }

    // If no representative was explicitly marked, default to the first owner
    if (!representativeOwner && newApartment.owners.length > 0) {
      const firstOwnerId = newApartment.owners[0];
      const firstOwner = await User.findById(firstOwnerId).session(session);
      const firstOwnerIndex = createdOwners.findIndex(o => o.email === firstOwner.email);
      if (firstOwnerIndex !== -1) {
        createdOwners[firstOwnerIndex].isRepresentative = true;
      }
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
    const groupName = `${newBuilding.building_name} - Private Group`;
    const groupDescription = `Private discussion group for residents of ${newBuilding.building_name}`;

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


export const createBuildingWithMultipleApartments = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1️⃣ Get the authenticated union agent user
    const agent = await User.findById(req.user.id).session(session);
    if (!agent || agent.role !== 'union_agent') {
      throw new Error("Agent user not found or invalid role");
    }

    const { building, apartments } = req.body;

    if (!building || !Array.isArray(apartments) || apartments.length === 0) {
      throw new Error("Building details and at least one apartment with owners are required");
    }

    // 2️⃣ Create building
    const buildingData = {
      // Map your frontend building fields to your Building schema fields
      building_name: building.name?.trim(),
      building_code: building.residenceCode?.trim(),
      building_address: building.address?.trim(),
      residenceCode: building.residenceCode?.trim(),
      land_area_sqm: building.propertyLandArea ? parseFloat(building.propertyLandArea) : undefined,
      number_of_blocks: building.numberOfBuildings ? parseInt(building.numberOfBuildings, 10) : undefined,
      avg_units_per_block: building.averageUnitsPerBuilding ? parseInt(building.averageUnitsPerBuilding, 10) : undefined,
      avg_floors_per_block: building.averageFloorsPerBuilding ? parseInt(building.averageFloorsPerBuilding, 10) : undefined,
      total_units: building.totalUnits ? parseInt(building.totalUnits, 10) : undefined,
      original_title_number: building.propertyPlanNumber?.trim(),
      has_garage: building.hasGarage === true || building.hasGarage === 'true' || building.hasGarage === 'yes',
      has_pool: building.hasSwimmingPool === true || building.hasSwimmingPool === 'true' || building.hasSwimmingPool === 'yes',
      has_shared_parts_with_other_buildings: building.sharedParts?.trim() && building.sharedParts.trim().toLowerCase() !== 'none',
      description: building.description?.trim(),
      agent: agent._id,
      // Add other fields as per your schema
    };

    const newBuilding = new Building(buildingData);
    await newBuilding.save({ session });

    // 3️⃣ Process each apartment and its owners
    const createdApartments = [];
    const createdOwners = [];
    for (const aptObj of apartments) {
      const { apartment: aptDetails, owners: ownersList } = aptObj;

      if (!aptDetails || !Array.isArray(ownersList) || ownersList.length === 0) {
        throw new Error("Each apartment must have details and at least one owner");
      }

      // 3.1 Create Apartment
      const apartmentData = {
        // Map your frontend apartment fields to your Apartment schema fields
        unit_code: aptDetails.apartment_number?.trim(),
        unit_description: aptDetails.ownership_status?.trim(),
        registration_number: aptDetails.main_plot_number?.trim(),
        division_number: aptDetails.plot_number?.trim(),
        area_sqm: aptDetails.space ? parseFloat(aptDetails.space) : undefined,
        floor: aptDetails.floor ? parseInt(aptDetails.floor, 10) : undefined,
        usage_type: aptDetails.type?.trim() || 'residential',
        land_share_ratio: aptDetails.share_percentage ? `${aptDetails.share_percentage}%` : undefined,
        building: newBuilding._id,
        agent: agent._id,
        owners: [], // Will be populated with User IDs
        ownerCredentials: [], // Will be populated with credential info
        // Add other fields as per your schema
      };

      const newApartment = new Apartment(apartmentData);
      await newApartment.save({ session });

      // 3.2 Create Owners for this apartment
      let representativeOwnerForThisApt = null;
      for (const owner of ownersList) {
        if (!owner.firstName || !owner.lastName || !owner.nationalId || !owner.email) {
          throw new Error("Owner must have firstName, lastName, nationalId, and email");
        }

        const firstName = owner.firstName.trim();
        const lastName = owner.lastName.trim();
        const fullName = `${firstName} ${lastName}`;

        // Generate email
        const emailLocal = `${apartmentData.unit_code.toLowerCase()}.${newBuilding.building_name.toLowerCase()}.${firstName.toLowerCase()}`
          .replace(/\s+/g, '')
          .replace(/[^a-z0-9.\-@]/g, '');
        const email = `${emailLocal}@owner.com`;

        // Check for existing email
        const existingUser = await User.findOne({ email }).session(session);
        if (existingUser) throw new Error(`Owner email already exists: ${email}`);

        // Hash the CIN as password
        const hashedPassword = await bcrypt.hash(owner.nationalId?.trim(), 10);

        const newUser = new User({
          name: fullName,
          email: email,
          password_hash: hashedPassword, // Store hashed CIN
          nationalId: owner.nationalId?.trim(), // Store the national ID - THIS IS CRUCIAL
          role: "property_owner",
          status: "ACTIVE",
          // Add other fields as per your User schema
        });

        await newUser.save({ session });

        // Add to apartment's owners array
        newApartment.owners.push(newUser._id);

        // Add owner credentials for the agent to see (plaintext CIN)
        newApartment.ownerCredentials.push({
          owner: newUser._id,
          email: newUser.email,
          password: owner.nationalId?.trim() // Store plaintext CIN for agent view
        });

        // Check if this owner is the representative for *this* apartment
        if (owner.isRepresentative) {
          if (representativeOwnerForThisApt) {
            console.warn(`Warning: Multiple representatives found for apartment ${apartmentData.unit_code}. Using the first one.`);
          } else {
            representativeOwnerForThisApt = newUser; // Mark the found representative
          }
        }

        createdOwners.push({
          name: fullName,
          email: newUser.email,
          password: owner.nationalId?.trim(), // Only for the representative (or all if not filtered, but now filtered)
          isRepresentative: owner.isRepresentative // Include flag in response if needed
        });
      }

      // If no representative was explicitly marked for this apartment, default to the first owner
      if (!representativeOwnerForThisApt && newApartment.owners.length > 0) {
          const firstOwnerId = newApartment.owners[0];
          const firstOwner = await User.findById(firstOwnerId).session(session);
          newApartment.ownerCredentials.push({
              owner: firstOwner._id,
              email: firstOwner.email,
              password: firstOwner.password_hash // Assuming password_hash is the plain password here too
          });
          representativeOwnerForThisApt = firstOwner;
          // Update the first owner in createdOwners array if needed
          const firstOwnerIndex = createdOwners.findIndex(o => o.email === firstOwner.email);
          if (firstOwnerIndex !== -1) {
              createdOwners[firstOwnerIndex].isRepresentative = true;
          }
      }

      await newApartment.save({ session });

      // 3.3 Link apartment to building
      newBuilding.apartments.push(newApartment._id);
      await newBuilding.save({ session });

      // 3.4 Link apartment to agent user
      if (!agent.apartments) agent.apartments = [];
      agent.apartments.push(newApartment._id);
      await agent.save({ session });

      // 3.5 Create private group for this apartment (optional, you might want one per building)
      // const groupName = `${newBuilding.building_name} - Apartment ${apartmentData.unit_code} Group`;
      // const groupDescription = `Private discussion group for residents of ${newBuilding.building_name} - ${apartmentData.unit_code}`;
      // const newGroup = new Group({ name: groupName, description: groupDescription, managers: [req.user.id], is_active: true });
      // await newGroup.save({ session });
      // await User.updateMany({ _id: { $in: newApartment.owners } }, { $push: { groups: newGroup._id } }, { session });

      createdApartments.push(newApartment);
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: `Building and ${createdApartments.length} apartments created successfully`,
      building: newBuilding,
      apartments: createdApartments,
      owners: createdOwners,
      // group: { _id: newGroup._id, name: newGroup.name, description: newGroup.description } // If group was created per apartment
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error in createBuildingWithMultipleApartments:', error);
    res.status(500).json({ error: error.message || 'Failed to create building and apartments' });
  }
};


/**
 * DELETE /api/buildings/:buildingId
 * Delete building and all its apartments
 */
export const deleteBuilding = async (req, res) => {
  try {
    const { buildingId } = req.params;
    
    // Get the authenticated user (who should be a union agent)
    const agent = await User.findById(req.user.id);
    if (!agent || agent.role !== 'union_agent') return res.status(404).json({ error: 'Agent user not found' });

    const building = await Building.findById(buildingId);
    if (!building) {
      return res.status(404).json({ error: 'Building not found' });
    }

    // Get all apartments in this building
    const apartments = await Apartment.find({ building: buildingId });
    const aptIds = apartments.map(a => a._id);

    // Collect owner ids
    const userIds = [];
    for (const a of apartments) {
      if (Array.isArray(a.owners)) userIds.push(...a.owners.map(x => x.toString()));
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