// ========================================
// FILE 2: backend/controllers/apartmentController.js
// ========================================
import Building from '../models/Building.js';
import Apartment from '../models/Apartment.js';
import User from '../models/User.js';

/**
 * GET /api/apartments/apartments-inbuilding/:buildingId
 * Get all apartments for a specific building
 */
export const getApartmentsByBuilding = async (req, res) => {
  try {
    const { buildingId } = req.params;

    // Verify building exists
    const building = await Building.findById(buildingId).select('building_name building_code').lean();
    if (!building) {
      return res.status(404).json({
        success: false,
        message: 'Building not found'
      });
    }

    // Get all apartments for this building
    const apartments = await Apartment.find({ building: buildingId })
      .select('unit_code floor area_sqm usage_type building createdAt updatedAt')
      .populate('building', 'building_name building_code')
      .sort({ unit_code: 1 })
      .lean();

    res.status(200).json({
      success: true,
      buildingName: building.building_name,
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
 * GET /api/apartments/:id
 * Get single apartment by ID
 */
export const getApartmentById = async (req, res) => {
  try {
    const { id } = req.params;

    const apartment = await Apartment.findById(id)
      .populate('building', 'building_name building_code building_address')
      .populate('agent', 'name email')
      .lean();

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

/**
 * POST /api/apartments/createApartmentForBuilding
 * Add apartment to existing building
 */
export const createApartmentForBuilding = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { apartment, buildingId } = req.body;

    if (!apartment || !buildingId) {
      return res.status(400).json({ error: 'Apartment data and buildingId are required' });
    }

    // Verify building exists
    const building = await Building.findById(buildingId).session(session);
    if (!building) {
      return res.status(404).json({ error: 'Building not found' });
    }

    // Get the authenticated agent
    const agent = await User.findById(req.user.id).session(session);
    if (!agent || agent.role !== 'union_agent') {
      return res.status(404).json({ error: 'Agent user not found' });
    }

    // Create apartment with correct field mapping
    const apartmentData = {
      unit_code: apartment.apartment_number?.trim(),
      unit_description: apartment.ownership_status?.trim(),
      registration_number: apartment.main_plot_number?.trim(),
      division_number: apartment.number?.trim(), // plot_number from frontend
      
      area_sqm: apartment.space ? parseFloat(apartment.space) : undefined,
      floor: apartment.floor ? parseInt(apartment.floor, 10) : undefined,
      usage_type: apartment.type?.trim() || 'residential',
      
      land_share_ratio: apartment.share_percentage ? `${apartment.share_percentage}%` : undefined,
      
      building: building._id,
      agent: agent._id,
      owners: [], // Empty initially
      ownerCredentials: [] // Empty initially
    };

    const newApartment = new Apartment(apartmentData);
    await newApartment.save({ session });

    // Link apartment to building
    building.apartments.push(newApartment._id);
    await building.save({ session });

    // Link apartment to agent
    if (!agent.apartments) agent.apartments = [];
    agent.apartments.push(newApartment._id);
    await agent.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: 'Apartment created successfully',
      apartment: newApartment
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error creating apartment:', error);
    res.status(500).json({ error: error.message || 'Failed to create apartment' });
  }
};

/**
 * DELETE /api/apartments/:apartmentId
 * Delete apartment
 */
export const deleteApartment = async (req, res) => {
  try {
    const { apartmentId } = req.params;
    
    // Get the authenticated agent
    const agent = await User.findById(req.user.id);
    if (!agent || agent.role !== 'union_agent') return res.status(404).json({ error: 'Agent user not found' });

    console.log('Attempting to delete apartment:', apartmentId, 'for agent:', agent._id);

    // Find apartment by ID and ensure it belongs to this agent
    const apt = await Apartment.findOneAndDelete({ 
      _id: apartmentId, 
      agent: agent._id 
    });
    
    if (!apt) return res.status(404).json({ error: 'Apartment not found' });

    // Remove from building
    if (apt.building) {
      await Building.findByIdAndUpdate(apt.building, {
        $pull: { apartments: apartmentId }
      });
    }

    // Remove from agent's apartments array
    await User.findByIdAndUpdate(agent._id, {
      $pull: { apartments: apartmentId }
    });

    // Handle owners
    const shouldDeleteUsers = req.query.deleteUsers === 'true' || req.body?.deleteUsers === true;
    const userIds = [...(apt.owners || [])];
    
    if (userIds.length > 0) {
      if (shouldDeleteUsers) {
        await User.deleteMany({ _id: { $in: userIds } });
      } else {
        await User.updateMany({ _id: { $in: userIds } }, { $unset: { apartments: 1 } });
      }
    }

    res.json({ success: true, message: 'Apartment deleted successfully' });
  } catch (error) {
    console.error('Error deleting apartment:', error);
    res.status(500).json({ error: 'Failed to delete apartment' });
  }
};

/**
 * GET /api/apartments
 * List all apartments for current union agent
 */
export const listApartments = async (req, res) => {
  try {
    // Find the user with role 'union_agent' based on the authenticated user ID
    const agent = await User.findById(req.user.id);
    if (!agent || agent.role !== 'union_agent') return res.status(404).json({ error: 'Agent not found' });

    // Find apartments where the agent field matches the agent's ID
    const apartments = await Apartment.find({ agent: agent._id })
      .populate('owners', 'name email nationalId status') // Use 'name' from User schema
      .populate('building', 'building_name'); // Optionally populate building name

    res.json(apartments);
  } catch (error) {
    console.error('Error listing apartments:', error);
    res.status(500).json({ error: 'Failed to list apartments' });
  }
};

/**
 * PUT /api/apartments/:apartmentId
 * Edit apartment details
 */
export const editApartment = async (req, res) => {
  try {
    const { apartmentId } = req.params;
    const updateData = req.body;

    // Find apartment where agent matches the authenticated user
    const apt = await Apartment.findOneAndUpdate(
      { _id: apartmentId, agent: req.user.id },
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!apt) return res.status(404).json({ error: 'Apartment not found' });
    
    res.json({ success: true, apartment: apt });
  } catch (error) {
    console.error('Error editing apartment:', error);
    res.status(500).json({ error: 'Failed to edit apartment' });
  }
};