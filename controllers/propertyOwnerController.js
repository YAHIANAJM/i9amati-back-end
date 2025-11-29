// ========================================
// FILE 3: backend/controllers/propertyOwnerController.js
// ========================================
import Apartment from '../models/Apartment.js';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import Building from '../models/Building.js';

/**
 * GET /api/property-owners/:apartmentId/owners
 * Get all owners for a specific apartment
 * Returns owner details from the embedded owners array
 */
export const getOwnersByApartment = async (req, res) => {
  try {
    const { apartmentId } = req.params;

    // Get apartment with building reference AND owners
    // No need to populate 'owners' as they are embedded
    const apartment = await Apartment.findById(apartmentId)
      .select('unit_code floor area_sqm building owners representativeUser')
      .populate('building', 'building_name building_address')
      .lean();

    if (!apartment) {
      return res.status(404).json({
        success: false,
        message: 'Apartment not found'
      });
    }

    // Map embedded owners to response format
    const ownersList = apartment.owners || [];
    const formattedOwners = ownersList.map(owner => ({
      _id: owner._id,
      name: `${owner.firstName} ${owner.lastName}`,
      firstName: owner.firstName,
      lastName: owner.lastName,
      email: owner.email,
      phone: owner.phone,
      nationalId: owner.nationalId,
      status: 'ACTIVE', // Placeholder as embedded owners don't have status
      createdAt: apartment.createdAt, // Placeholder
      password_hash: 'N/A',
      isRepresentative: owner.isRepresentative
    }));

    res.status(200).json({
      success: true,
      apartment: {
        _id: apartment._id,
        unit_code: apartment.unit_code,
        floor: apartment.floor,
        area_sqm: apartment.area_sqm,
        building: apartment.building
      },
      totalOwners: formattedOwners.length,
      data: formattedOwners
    });

  } catch (error) {
    console.error('Error fetching owners:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve owners',
      error: error.message
    });
  }
};

/**
 * POST /api/property-owners/createOwnerForApartment
 * Add owner to apartment (Embedded)
 */
export const createOwnerForApartment = async (req, res) => {
  try {
    const { owner, apartmentId } = req.body;

    if (!owner || !apartmentId) {
      return res.status(400).json({ error: 'Owner data and apartmentId required' });
    }

    if (!owner.firstName || !owner.lastName || !owner.nationalId || !owner.email) {
      return res.status(400).json({ error: 'firstName, lastName, nationalId, and email are required' });
    }

    // Get the authenticated agent
    const agent = await User.findById(req.user.id);
    if (!agent || agent.role !== 'union_agent') return res.status(404).json({ error: 'Agent not found' });

    const apt = await Apartment.findOne({ _id: apartmentId, agent: agent._id });
    if (!apt) return res.status(404).json({ error: 'Apartment not found' });

    // Check if email already exists in this apartment's owners
    const emailExists = apt.owners.some(o => o.email === owner.email);
    if (emailExists) {
      return res.status(409).json({ error: 'Owner email already exists in this apartment' });
    }

    const newOwner = {
      firstName: owner.firstName,
      lastName: owner.lastName,
      nationalId: owner.nationalId,
      email: owner.email,
      phone: owner.phone,
      isRepresentative: owner.isRepresentative || false
    };

    apt.owners.push(newOwner);
    await apt.save();

    // Retrieve the added owner (it will have an _id now)
    const addedOwner = apt.owners[apt.owners.length - 1];

    res.status(201).json({
      success: true,
      message: 'Owner added successfully',
      owner: {
        _id: addedOwner._id,
        name: `${addedOwner.firstName} ${addedOwner.lastName}`,
        email: addedOwner.email,
        nationalId: addedOwner.nationalId,
        isRepresentative: addedOwner.isRepresentative
      }
    });
  } catch (error) {
    console.error('Error adding owner:', error);
    res.status(500).json({ error: error.message || 'Failed to add owner' });
  }
};

/**
 * DELETE /api/property-owners/:apartmentId/owner/:ownerId
 * Remove owner from apartment
 */
export const removeOwnerFromApartment = async (req, res) => {
  try {
    const { apartmentId, ownerId } = req.params;

    const agent = await User.findById(req.user.id);
    if (!agent || agent.role !== 'union_agent') return res.status(404).json({ error: 'Agent not found' });

    const apt = await Apartment.findOne({ _id: apartmentId, agent: agent._id });
    if (!apt) return res.status(404).json({ error: 'Apartment not found' });

    // Remove embedded owner
    apt.owners.pull({ _id: ownerId });
    await apt.save();

    res.json({ success: true, message: 'Owner removed successfully' });
  } catch (error) {
    console.error('Error removing owner:', error);
    res.status(500).json({ error: 'Failed to remove owner' });
  }
};

/**
 * PUT /api/property-owners/:apartmentId/owner/:ownerId
 * Update owner information
 */
export const updateOwnerInfo = async (req, res) => {
  try {
    const { apartmentId, ownerId } = req.params;
    const updateData = req.body;

    const agent = await User.findById(req.user.id);
    if (!agent || agent.role !== 'union_agent') return res.status(404).json({ error: 'Agent not found' });

    const apt = await Apartment.findOne({ _id: apartmentId, agent: agent._id });
    if (!apt) return res.status(404).json({ error: 'Apartment not found' });

    const ownerSubdoc = apt.owners.id(ownerId);
    if (!ownerSubdoc) return res.status(404).json({ error: 'Owner not found' });

    if (updateData.firstName) ownerSubdoc.firstName = updateData.firstName;
    if (updateData.lastName) ownerSubdoc.lastName = updateData.lastName;
    if (updateData.email) ownerSubdoc.email = updateData.email;
    if (updateData.phone) ownerSubdoc.phone = updateData.phone;
    if (updateData.nationalId) ownerSubdoc.nationalId = updateData.nationalId;
    if (updateData.isRepresentative !== undefined) ownerSubdoc.isRepresentative = updateData.isRepresentative;

    await apt.save();

    res.json({
      success: true,
      owner: {
        _id: ownerSubdoc._id,
        name: `${ownerSubdoc.firstName} ${ownerSubdoc.lastName}`,
        ...updateData
      }
    });
  } catch (error) {
    console.error('Error updating owner:', error);
    res.status(500).json({ error: 'Failed to update owner' });
  }
};

/**
 * GET /api/property-owners/:apartmentId
 * Get owners for apartment (alternative endpoint)
 */
export const getApartmentOwners = async (req, res) => {
  return getOwnersByApartment(req, res);
};