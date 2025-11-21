// ========================================
// FILE 3: backend/controllers/propertyOwnerController.js
// ========================================
import Apartment from '../models/Apartment.js';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * GET /api/property-owners/:apartmentId/owners
 * Get all owners for a specific apartment
 * Returns FULL owner details including email and password_hash
 */
export const getOwnersByApartment = async (req, res) => {
  try {
    const { apartmentId } = req.params;

    // Get apartment with building reference AND owners
    const apartment = await Apartment.findById(apartmentId)
      .select('unit_code floor area_sqm building owners ownerCredentials')
      .populate('building', 'building_name building_address')
      .populate('owners', 'name email nationalId status createdAt') // ← Get owner details
      .lean();

    if (!apartment) {
      return res.status(404).json({
        success: false,
        message: 'Apartment not found'
      });
    }

    // Add credential information to each owner
    const ownersWithCredentials = apartment.owners.map(owner => {
      const credential = apartment.ownerCredentials.find(cred => 
        cred.owner.toString() === owner._id.toString()
      );
        return {
          _id: owner._id,
          name: owner.name,
          email: owner.email,
          status: owner.status,
          createdAt: owner.createdAt,
          nationalId: owner.nationalId || null,
          password_hash: credential?.password || 'N/A'
        };
    });

    res.status(200).json({
      success: true,
      apartment: {
        _id: apartment._id,
        unit_code: apartment.unit_code,
        floor: apartment.floor,
        area_sqm: apartment.area_sqm,
        building: apartment.building
      },
      totalOwners: ownersWithCredentials?.length || 0,
      data: ownersWithCredentials
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
 * Add owner to apartment
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

    // Get building for email generation
    const building = await Building.findById(apt.building).select('building_name');
    const buildingName = building?.building_name || 'building';

    // Check if email already exists
    const existingUser = await User.findOne({ email: owner.email });
    if (existingUser) {
      return res.status(409).json({ error: 'Owner email already exists' });
    }
    
    // Hash the CIN as password
    const hashedPassword = await bcrypt.hash(owner.nationalId, 10);
    
    const newUser = new User({ 
      name: `${owner.firstName} ${owner.lastName}`,
      email: owner.email, 
      password_hash: hashedPassword, 
      nationalId: owner.nationalId,
      role: 'property_owner', 
      status: 'ACTIVE' 
    });
    await newUser.save();
    
    // Add to apartment's owners array
    apt.owners.push(newUser._id);
    
    // Add owner credentials for agent view
    apt.ownerCredentials.push({
      owner: newUser._id,
      email: owner.email,
      password: owner.nationalId // Store plaintext CIN for agent view
    });
    
    await apt.save();
    
    res.status(201).json({ 
      success: true,
      message: 'Owner added successfully',
      owner: { 
        _id: newUser._id, 
        name: newUser.name, 
        email: newUser.email,
        nationalId: newUser.nationalId,
        isRepresentative: owner.isRepresentative || false
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
    
    // Get the authenticated agent
    const agent = await User.findById(req.user.id);
    if (!agent || agent.role !== 'union_agent') return res.status(404).json({ error: 'Agent not found' });
    
    const apt = await Apartment.findOne({ _id: apartmentId, agent: agent._id });
    if (!apt) return res.status(404).json({ error: 'Apartment not found' });
    
    // Remove owner from apartment
    apt.owners = apt.owners.filter(o => o.toString() !== ownerId);
    apt.ownerCredentials = apt.ownerCredentials.filter(cred => 
      cred.owner.toString() !== ownerId
    );
    await apt.save();
    
    // Delete the user
    await User.findByIdAndDelete(ownerId);
    
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
    
    // Get the authenticated agent
    const agent = await User.findById(req.user.id);
    if (!agent || agent.role !== 'union_agent') return res.status(404).json({ error: 'Agent not found' });
    
    const apt = await Apartment.findOne({ _id: apartmentId, agent: agent._id });
    if (!apt) return res.status(404).json({ error: 'Apartment not found' });
    
    const user = await User.findByIdAndUpdate(
      ownerId, 
      updateData, 
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ error: 'Owner not found' });
    
    res.json({ success: true, owner: user });
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