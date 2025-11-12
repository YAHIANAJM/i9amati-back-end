// ========================================
// FILE 3: backend/controllers/propertyOwnerController.js
// ========================================
import Apartment from '../models/Apartment.js';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * GET /api/union/apartments/:apartmentId/owners
 * Get all owners for a specific apartment
 * Returns FULL owner details including email and password_hash
 */
export const getOwnersByApartment = async (req, res) => {
  try {
    const { apartmentId } = req.params;

    // Get apartment with building reference
    const apartment = await Apartment.findById(apartmentId)
      .select('apartment_number floor space building')
      .populate('building', 'name address')
      .lean();

    if (!apartment) {
      return res.status(404).json({
        success: false,
        message: 'Apartment not found'
      });
    }

    // Get all owners for this apartment
    const owners = await User.find({
      apartment: apartmentId,
      role: 'property_owner'
    })
      .select('firstName lastName email password_hash nationalId status createdAt')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      apartment: {
        _id: apartment._id,
        apartment_number: apartment.apartment_number,
        floor: apartment.floor,
        space: apartment.space,
        building: apartment.building
      },
      totalOwners: owners.length,
      data: owners
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
 * GET /api/union/owner/apartment
 * Property owner gets their own apartment details
 */
export const getOwnerApartment = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'property_owner') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    const apartment = await Apartment.findById(user.apartment)
      .populate('owners', 'firstName lastName email')
      .populate('residents', 'firstName lastName');
    
    if (!apartment) return res.status(404).json({ error: 'Apartment not found' });
    
    res.json({ apartment });
  } catch (error) {
    console.error('Error fetching owner apartment:', error);
    res.status(500).json({ error: 'Failed to fetch apartment' });
  }
};

/**
 * POST /api/union/apartments/:apartmentId/owner
 * Add owner to apartment
 */
export const addOwnerToApartment = async (req, res) => {
  try {
    const { apartmentId } = req.params;
    const { firstName, lastName, nationalId } = req.body || {};
    
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'firstName and lastName required' });
    }
    
    const agent = await UnionAgent.findOne({ user: req.user.id });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    
    const apt = await Apartment.findOne({ _id: apartmentId, agent: agent._id });
    if (!apt) return res.status(404).json({ error: 'Apartment not found' });

    // Get building for email generation
    const building = await Building.findById(apt.building).select('name');
    const buildingName = building?.name || 'building';

    // Generate credentials
    const emailLocal = `${apt.apartment_number.toLowerCase()}.${buildingName.toLowerCase()}.${firstName.toLowerCase()}`.replace(/\s+/g, '').replace(/[^a-z0-9.\-@]/g, '');
    const email = `${emailLocal}@owner.com`;
    const username = emailLocal;
    
    // Check uniqueness
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: 'Owner email already exists' });
    }
    
    const rawPassword = crypto.randomBytes(6).toString('hex');
    const password_hash = await bcrypt.hash(rawPassword, 10);
    
    const user = new User({ 
      firstName,
      lastName,
      email, 
      password_hash, 
      nationalId,
      role: 'property_owner', 
      apartment: apt._id, 
      status: 'ACTIVE' 
    });
    await user.save();
    
    apt.owners.push(user._id);
    await apt.save();
    
    res.status(201).json({ 
      owner: { 
        _id: user._id, 
        name: `${firstName} ${lastName}`, 
        email 
      }, 
      credentials: { email, password: rawPassword } 
    });
  } catch (error) {
    console.error('Error adding owner:', error);
    res.status(500).json({ error: 'Failed to add owner' });
  }
};

/**
 * DELETE /api/union/apartments/:apartmentId/owner/:ownerId
 * Remove owner from apartment
 */
export const removeOwnerFromApartment = async (req, res) => {
  try {
    const { apartmentId, ownerId } = req.params;
    const agent = await UnionAgent.findOne({ user: req.user.id });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    
    const apt = await Apartment.findOne({ _id: apartmentId, agent: agent._id });
    if (!apt) return res.status(404).json({ error: 'Apartment not found' });
    
    apt.owners = apt.owners.filter(o => o.toString() !== ownerId);
    await apt.save();
    
    await User.findByIdAndUpdate(ownerId, { $unset: { apartment: 1 } });
    res.json(apt);
  } catch (error) {
    console.error('Error removing owner:', error);
    res.status(500).json({ error: 'Failed to remove owner' });
  }
};

/**
 * PUT /api/union/apartments/:apartmentId/owner/:ownerId
 * Update owner information
 */
export const updateOwnerInfo = async (req, res) => {
  try {
    const { apartmentId, ownerId } = req.params;
    const { firstName, lastName, email, nationalId } = req.body || {};
    
    const agent = await UnionAgent.findOne({ user: req.user.id });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    
    const apt = await Apartment.findOne({ _id: apartmentId, agent: agent._id });
    if (!apt) return res.status(404).json({ error: 'Apartment not found' });
    
    const user = await User.findByIdAndUpdate(
      ownerId, 
      { firstName, lastName, email, nationalId }, 
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'Owner not found' });
    
    res.json(user);
  } catch (error) {
    console.error('Error updating owner:', error);
    res.status(500).json({ error: 'Failed to update owner' });
  }
};