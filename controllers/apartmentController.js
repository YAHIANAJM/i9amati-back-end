// ========================================
// FILE 2: backend/controllers/apartmentController.js
// ========================================
import Building from '../models/Building.js';
import Apartment from '../models/Apartment.js';
import User from '../models/User.js';
import UnionAgent from '../models/UnionAgent.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

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
      data: apartments
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
    const agent = await UnionAgent.findOne({ user: req.user.id });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    
    const apartments = await Apartment.find({ agent: agent._id })
      .populate('owners', 'firstName lastName email')
      .populate('residents', 'firstName lastName');
    
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
    const agent = await UnionAgent.findOne({ user: req.user.id });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    console.log('Attempting to delete apartment:', apartmentId, 'for agent:', agent._id);
    
    const apt = await Apartment.findOneAndDelete({ _id: apartmentId, agent: agent._id });
    if (!apt) return res.status(404).json({ error: 'Apartment not found' });

    // Remove ref from agent
    agent.apartments = agent.apartments.filter(a => a.toString() !== apartmentId);
    await agent.save();

    // Remove from building
    if (apt.building) {
      await Building.findByIdAndUpdate(apt.building, {
        $pull: { apartments: apartmentId }
      });
    }

    // Handle users
    const shouldDeleteUsers = req.query.deleteUsers === 'true' || req.body?.deleteUsers === true;
    const userIds = [...(apt.owners || []), ...(apt.residents || [])];
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
  try {
    const { apartmentId, userId } = req.body;
    const apt = await Apartment.findOne({ _id: apartmentId, agent: req.user.id });
    if (!apt) return res.status(404).json({ error: 'Apartment not found' });
    
    if (!apt.residents.includes(userId)) apt.residents.push(userId);
    await apt.save();
    
    await User.findByIdAndUpdate(userId, { apartment: apt._id });
    res.json(apt);
  } catch (error) {
    console.error('Error adding resident:', error);
    res.status(500).json({ error: 'Failed to add resident' });
  }
};

/**
 * POST /api/union/apartments/:apartmentId/residents/remove
 * Remove resident from apartment
 */
export const removeResident = async (req, res) => {
  try {
    const { apartmentId, userId } = req.body;
    const apt = await Apartment.findOne({ _id: apartmentId, agent: req.user.id });
    if (!apt) return res.status(404).json({ error: 'Apartment not found' });
    
    apt.residents = apt.residents.filter(r => r.toString() !== userId);
    await apt.save();
    
    await User.findByIdAndUpdate(userId, { $unset: { apartment: 1 } });
    res.json(apt);
  } catch (error) {
    console.error('Error removing resident:', error);
    res.status(500).json({ error: 'Failed to remove resident' });
  }
};

/**
 * POST /api/union/apartments/edit
 * Edit apartment details
 */
export const editApartment = async (req, res) => {
  try {
    const { apartmentId, name } = req.body;
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