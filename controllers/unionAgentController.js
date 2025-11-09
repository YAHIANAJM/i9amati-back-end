// backend/controllers/unionAgentController.js
import UnionAgent from '../models/UnionAgent.js';
import User from '../models/User.js';

// Get agent profile
export const getAgentProfile = async (req, res) => {
  try {
    const agent = await UnionAgent.findOne({ user: req.user.id })
      .populate('user', 'firstName lastName email');
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get profile' });
  }
};

// Update agent profile
export const updateAgentProfile = async (req, res) => {
  try {
    const { name, company, prefix } = req.body;
    const agent = await UnionAgent.findOneAndUpdate(
      { user: req.user.id },
      { name, company, prefix },
      { new: true }
    );
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// Get agent statistics
export const getAgentStats = async (req, res) => {
  try {
    const agent = await UnionAgent.findOne({ user: req.user.id });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    
    const totalBuildings = await Building.countDocuments();
    const totalApartments = agent.apartments.length;
    const totalOwners = await User.countDocuments({ 
      role: 'property_owner',
      apartment: { $in: agent.apartments }
    });
    
    res.json({ totalBuildings, totalApartments, totalOwners });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
};