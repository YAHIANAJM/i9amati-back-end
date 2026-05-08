import Residence from "../models/Residence.js";
import Building from "../models/Building.js";
import User from "../models/User.js";
import Group from "../models/Group.js";

/**
 * GET /api/residences
 * Get all residences for the logged-in agent
 */
export const getResidences = async (req, res) => {
  try {
    const residences = await Residence.find({ agent: req.user.id }).lean();
    res.status(200).json({
      success: true,
      data: residences,
    });
  } catch (error) {
    console.error("Error fetching residences:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve residences",
      error: error.message,
    });
  }
};

/**
 * GET /api/residences/:id
 * Get single residence by ID
 */
export const getResidenceById = async (req, res) => {
  try {
    const residence = await Residence.findOne({
      _id: req.params.id,
      agent: req.user.id,
    }).lean();

    if (!residence) {
      return res.status(404).json({
        success: false,
        message: "Residence not found",
      });
    }

    res.status(200).json({
      success: true,
      data: residence,
    });
  } catch (error) {
    console.error("Error fetching residence:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve residence",
      error: error.message,
    });
  }
};

/**
 * POST /api/residences
 * Create a new residence
 */
export const createResidence = async (req, res) => {
  try {
    const { name, address, city, description, facilities, totalUnits, occupiedUnits } = req.body;

    const newResidence = new Residence({
      name,
      address,
      city,
      description,
      facilities,
      totalUnits: totalUnits || 0,
      occupiedUnits: occupiedUnits || 0,
      agent: req.user.id,
    });

    await newResidence.save();

    // Auto-create the shared group for all buildings in this إقامة
    const residenceGroup = new Group({
      name: `${name} - Group`,
      description: `Shared discussion group for all residents of ${name}`,
      managers: [req.user.id],
      is_active: true,
      residence: newResidence._id,
    });
    await residenceGroup.save();

    newResidence.group = residenceGroup._id;
    await newResidence.save();

    res.status(201).json({
      success: true,
      message: "Residence created successfully",
      data: newResidence,
      group: {
        _id: residenceGroup._id,
        name: residenceGroup.name,
      },
    });
  } catch (error) {
    console.error("Error creating residence:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create residence",
      error: error.message,
    });
  }
};

/**
 * PATCH /api/residences/:id
 * Update residence details
 */
export const updateResidence = async (req, res) => {
  try {
    const residence = await Residence.findOneAndUpdate(
      { _id: req.params.id, agent: req.user.id },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!residence) {
      return res.status(404).json({
        success: false,
        message: "Residence not found or unauthorized",
      });
    }

    res.status(200).json({
      success: true,
      message: "Residence updated successfully",
      data: residence,
    });
  } catch (error) {
    console.error("Error updating residence:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update residence",
      error: error.message,
    });
  }
};

/**
 * DELETE /api/residences/:id
 * Delete residence and unmount its buildings
 */
export const deleteResidence = async (req, res) => {
  try {
    const residence = await Residence.findOneAndDelete({
      _id: req.params.id,
      agent: req.user.id,
    });

    if (!residence) {
      return res.status(404).json({
        success: false,
        message: "Residence not found or unauthorized",
      });
    }

    // Unlink buildings from this residence
    await Building.updateMany(
      { residence: req.params.id },
      { $set: { residence: null, union_type: "immeuble" } }
    );

    res.status(200).json({
      success: true,
      message: "Residence deleted and buildings unlinked",
    });
  } catch (error) {
    console.error("Error deleting residence:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete residence",
      error: error.message,
    });
  }
};
