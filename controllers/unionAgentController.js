// backend/controllers/unionAgentController.js
import User from "../models/User.js";
import Building from "../models/Building.js";
import Apartment from "../models/Apartment.js";

// Get agent profile - Use User schema
export const getAgentProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    
    res.json({
      _id: user._id,
      name: user.name || '',
      email: user.email,
      nationalId: user.nationalId || '',
      role: user.role,
      status: user.status,
      apartment: user.apartment
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Failed to get profile" });
  }
};

// Update agent profile - Use User schema
export const updateAgentProfile = async (req, res) => {
  try {
    const { name } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name },
      { new: true }
    );
    
    if (!user) return res.status(404).json({ error: "User not found" });
    
    res.json({
      _id: user._id,
      name: user.name || '',
      email: user.email,
      nationalId: user.nationalId || '',
      role: user.role,
      status: user.status,
      apartment: user.apartment
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
};

// Get agent statistics
export const getAgentStats = async (req, res) => {
  try {
    const agent = await User.findById(req.user.id);
    if (!agent) return res.status(404).json({ error: "Agent user not found" });

    // Count buildings where this agent is assigned
    const totalBuildings = await Building.countDocuments({
      agent: req.user.id
    });
    
    // Count apartments where this agent is assigned
    const totalApartments = await Apartment.countDocuments({
      agent: req.user.id
    });
    
    // Count property owners in apartments assigned to this agent
    const totalOwners = await User.countDocuments({
      role: "property_owner",
      apartment: { $in: await Apartment.find({ agent: req.user.id }).distinct('_id') }
    });

    res.json({ 
      totalBuildings, 
      totalApartments, 
      totalOwners 
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ error: "Failed to get stats" });
  }
};