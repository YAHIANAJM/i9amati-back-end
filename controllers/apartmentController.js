// ========================================
// FILE 2: backend/controllers/apartmentController.js
// ========================================
import Building from '../models/Building.js';
import Apartment from '../models/Apartment.js';
import User from '../models/User.js';

/**
 * GET /api/union/buildings/:buildingId/apartments
 * Get all apartments for a specific building
 */
export const getApartmentsByBuilding = async (req, res) => {
  try {
    const { buildingId } = req.params;

    // Verify building exists
    const building = await Building.findById(buildingId).select('name').lean();
    if (!building) {
      return res.status(404).json({
        success: false,
        message: 'Building not found'
      });
    }

    // Get all apartments for this building
    const apartments = await Apartment.find({ building: buildingId })
      .select('apartment_number floor space type name createdAt')
      .sort({ apartment_number: 1 })
      .lean();

    res.status(200).json({
      success: true,
      buildingName: building.name,
      totalApartments: apartments.length,
       apartments
    });

  } catch (error) {
    console.error('Error fetching apartments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve apartments',
      error: error.message
    });
  }
};

/**
 * GET /api/union/apartments
 * List all apartments for current union agent
 */
export const listApartments = async (req, res) => {
  try {
    // Find the user with role 'union_agent' based on the authenticated user ID
    const agent = await User.findOne({ _id: req.user.id, role: 'union_agent' });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // Find apartments where the agent field matches the agent's ID
    // Populate only the 'owners' field, as 'residents' doesn't exist in the schema
    const apartments = await Apartment.find({ agent: agent._id })
      .populate('owners', 'name email') // Use 'name' from User schema
      .populate('building', 'name'); // Optionally populate building name

    res.json(apartments);
  } catch (error) {
    console.error('Error listing apartments:', error);
    res.status(500).json({ error: 'Failed to list apartments' });
  }
};

/**
 * DELETE /api/union/apartments/:apartmentId
 * Delete apartment
 */
export const deleteApartment = async (req, res) => {
  try {
    const { apartmentId } = req.params;
    // Find the user with role 'union_agent' based on the authenticated user ID
    const agent = await User.findOne({ _id: req.user.id, role: 'union_agent' });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    console.log('Attempting to delete apartment:', apartmentId, 'for agent:', agent._id);

    // Find apartment by ID and ensure the agent matches the authenticated user
    const apt = await Apartment.findOneAndDelete({ _id: apartmentId, agent: agent._id });
    if (!apt) return res.status(404).json({ error: 'Apartment not found' });

    // Remove from building
    if (apt.building) {
      await Building.findByIdAndUpdate(apt.building, {
        $pull: { apartments: apartmentId }
      });
    }

    // Handle users (owners only, as residents don't exist in schema)
    const shouldDeleteUsers = req.query.deleteUsers === 'true' || req.body?.deleteUsers === true;
    // Use the 'owners' array from the apartment schema which holds User IDs
    const userIds = [...(apt.owners || [])];
    if (userIds.length > 0) {
      if (shouldDeleteUsers) {
        await User.deleteMany({ _id: { $in: userIds } });
      } else {
        await User.updateMany({ _id: { $in: userIds } }, { $unset: { apartment: 1 } });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting apartment:', error);
    res.status(500).json({ error: 'Failed to delete apartment' });
  }
};

/**
 * POST /api/union/apartments/:apartmentId/residents/add
 * Add resident to apartment
 */
export const addResident = async (req, res) => {
  // This endpoint is now invalid as 'residents' field doesn't exist in the schema.
  res.status(400).json({ error: 'Residents field does not exist in the Apartment schema.' });
};

/**
 * POST /api/union/apartments/:apartmentId/residents/remove
 * Remove resident from apartment
 */
export const removeResident = async (req, res) => {
  // This endpoint is now invalid as 'residents' field doesn't exist in the schema.
  res.status(400).json({ error: 'Residents field does not exist in the Apartment schema.' });
};

/**
 * POST /api/union/apartments/edit
 * Edit apartment details
 */
export const editApartment = async (req, res) => {
  try {
    const { apartmentId, name } = req.body;
    // Find apartment where agent matches the authenticated user
    const apt = await Apartment.findOneAndUpdate(
      { _id: apartmentId, agent: req.user.id },
      { name },
      { new: true }
    );
    if (!apt) return res.status(404).json({ error: 'Apartment not found' });
    res.json(apt);
  } catch (error) {
    console.error('Error editing apartment:', error);
    res.status(500).json({ error: 'Failed to edit apartment' });
  }
};

// NEW: Get Apartment Details by ID
export const getApartmentById = async (req, res) => {
  try {
    const { id } = req.params; // Use 'id' to match frontend call

    // Find the apartment by ID
    const apartment = await Apartment.findById(id)
      .populate('building', 'name') // Optionally populate building name
      .populate('owners', 'name email nationalId role status') // Populate owner details using 'name' from User schema
      // Note: Populating 'agent' here might fail if the agent field still points to 'UnionAgent' in the DB.
      // It should point to 'User' now. You might need to update existing docs or handle the ref.
      .populate('agent', 'name email') // Populate agent details (assuming agent ID is now a User ID)
      .lean(); // Use lean() for better performance if not modifying

    if (!apartment) {
      return res.status(404).json({
        success: false,
        message: 'Apartment not found'
      });
    }

    res.status(200).json({
      success: true,
       apartment
    });

  } catch (error) {
    console.error('Error fetching apartment details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve apartment details',
      error: error.message
    });
  }
};

// NEW: Get Building Details by ID (for frontend)
export const getBuildingById = async (req, res) => {
  try {
    const { id } = req.params; // Use 'id' to match frontend call

    // Find the building by ID
    const building = await Building.findById(id)
      .populate('agent', 'name email') // Optionally populate agent details
      .populate('apartments', 'apartment_number floor space') // Optionally populate apartment count/summary
      .lean(); // Use lean() for better performance if not modifying

    if (!building) {
      return res.status(404).json({
        success: false,
        message: 'Building not found'
      });
    }

    res.status(200).json({
      success: true,
       building
    });

  } catch (error) {
    console.error('Error fetching building details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve building details',
      error: error.message
    });
  }
};