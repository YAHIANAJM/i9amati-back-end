// ========================================
// FILE 3: backend/controllers/propertyOwnerController.js
// ========================================
import Apartment from "../models/Apartment.js";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import Building from "../models/Building.js";

/**
 * GET /api/property-owners
 * Get all property owners (for dropdowns, lists, etc.)
 * For union agents, only return owners from their building
 * NOTE: Owners are embedded in Apartments, not separate User documents
 */
export const getAllOwners = async (req, res) => {
  try {
    let apartmentQuery = {};

    // If request comes from a union agent, filter by their building
    if (req.user && req.user.role === "union_agent") {
      // Find the agent's building
      const building = await Building.findOne({ agent: req.user._id });

      if (building) {
        apartmentQuery.building = building._id;
      }
    }

    // Get all apartments with embedded owners
    const apartments = await Apartment.find(apartmentQuery)
      .select(
        "unit_code apartment_number floor owners main_plot_number ownerCredentials",
      )
      .lean();

    // Extract all unique owners from apartments
    const ownersMap = new Map();

    apartments.forEach((apt) => {
      if (apt.owners && apt.owners.length > 0) {
        apt.owners.forEach((owner) => {
          const key = owner.email || owner.nationalId; // Use email or nationalId as unique key
          if (!ownersMap.has(key)) {
            ownersMap.set(key, {
              _id: owner._id || owner.nationalId, // Use embedded _id or nationalId
              name: `${owner.firstName} ${owner.lastName}`,
              firstName: owner.firstName,
              lastName: owner.lastName,
              email: owner.email,
              nationalId: owner.nationalId,
              phone: owner.phone,
              isRepresentative: owner.isRepresentative,
              apartments: [apt], // Store apartment info
            });
          } else {
            // Add apartment to existing owner
            ownersMap.get(key).apartments.push(apt);
          }
        });
      }
    });

    const owners = Array.from(ownersMap.values());

    res.status(200).json({
      success: true,
      count: owners.length,
      owners,
    });
  } catch (error) {
    console.error("Error fetching owners:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve owners",
      error: error.message,
    });
  }
};

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
      .select(
        "unit_code floor area_sqm building owners representativeUser ownerCredentials",
      )
      .populate("building", "building_name building_address")
      .lean();

    if (!apartment) {
      return res.status(404).json({
        success: false,
        message: "Apartment not found",
      });
    }

    // Map embedded owners to response format
    const ownersList = apartment.owners || [];
    const formattedOwners = ownersList.map((owner) => {
      // Find credentials if this is the rep
      const ownerCreds = owner.isRepresentative
        ? (apartment.ownerCredentials || []).find(
            (c) => c.email === owner.email,
          )
        : null;

      return {
        _id: owner._id,
        name: `${owner.firstName} ${owner.lastName}`,
        firstName: owner.firstName,
        lastName: owner.lastName,
        email: owner.email,
        phone: owner.phone,
        nationalId: owner.nationalId,
        status: "ACTIVE",
        createdAt: apartment.createdAt,
        password: ownerCreds ? ownerCreds.password : null,
        isRepresentative: owner.isRepresentative,
      };
    });

    res.status(200).json({
      success: true,
      apartment: {
        _id: apartment._id,
        unit_code: apartment.unit_code,
        floor: apartment.floor,
        area_sqm: apartment.area_sqm,
        building: apartment.building,
      },
      totalOwners: formattedOwners.length,
      data: formattedOwners,
    });
  } catch (error) {
    console.error("Error fetching owners:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve owners",
      error: error.message,
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
      return res
        .status(400)
        .json({ error: "Owner data and apartmentId required" });
    }

    if (!owner.firstName || !owner.lastName || !owner.nationalId) {
      return res
        .status(400)
        .json({ error: "firstName, lastName, and nationalId are required" });
    }

    // Get the authenticated agent
    const agent = await User.findById(req.user.id);
    if (!agent || agent.role !== "union_agent")
      return res.status(404).json({ error: "Agent not found" });

    // Populate building to generate email
    const apt = await Apartment.findOne({
      _id: apartmentId,
      agent: agent._id,
    }).populate("building");
    if (!apt) return res.status(404).json({ error: "Apartment not found" });

    const firstName = owner.firstName.trim();
    const lastName = owner.lastName.trim();
    const fullName = `${firstName} ${lastName}`;
    const nationalId = owner.nationalId.trim();

    // Generate system email
    const buildingName = apt.building?.building_name || "building";
    const emailLocal =
      `${(apt.unit_code || "apt").toLowerCase()}.${buildingName.toLowerCase()}.${firstName.toLowerCase()}`
        .replace(/\s+/g, "")
        .replace(/[^a-z0-9.\-@]/g, "");
    const generatedEmail = `${emailLocal}@owner.com`;

    let representativeUser = null;
    let createdCredentials = null;

    // If this owner is marked as representative, create a User account
    if (owner.isRepresentative) {
      // Check if apartment already has a representative User
      if (apt.representativeUser) {
        // Technically we could allow switching, but usually one is enough.
        // For now, let's create the user if it doesn't exist for this specific email.
      }

      const existingUser = await User.findOne({ email: generatedEmail });
      if (existingUser)
        return res
          .status(409)
          .json({ error: "Representative email already exists" });

      const hashedPassword = await bcrypt.hash(nationalId, 10);
      representativeUser = new User({
        name: fullName,
        email: generatedEmail,
        password_hash: hashedPassword,
        nationalId: nationalId,
        role: "property_owner",
        status: "ACTIVE",
      });
      await representativeUser.save();

      // Store credentials for retrieval
      apt.ownerCredentials = apt.ownerCredentials || [];
      apt.ownerCredentials.push({
        owner: representativeUser._id,
        email: generatedEmail,
        password: nationalId,
      });
      apt.representativeUser = representativeUser._id;

      createdCredentials = {
        email: generatedEmail,
        password: nationalId,
      };

      // Add to Private Group
      const groupName = `${buildingName} - Private Group`;
      const group = await Group.findOne({ name: groupName });
      if (group) {
        representativeUser.groups = representativeUser.groups || [];
        representativeUser.groups.push(group._id);
        await representativeUser.save();
      }
    }

    const newOwner = {
      firstName: firstName,
      lastName: lastName,
      nationalId: nationalId,
      email: generatedEmail,
      phone: owner.phone || "",
      isRepresentative: !!owner.isRepresentative,
    };

    apt.owners.push(newOwner);
    await apt.save();

    res.status(201).json({
      success: true,
      message: "Owner added successfully",
      owner: {
        _id: apt.owners[apt.owners.length - 1]._id,
        name: fullName,
        email: generatedEmail,
        nationalId: nationalId,
        isRepresentative: !!owner.isRepresentative,
      },
      credentials: createdCredentials,
    });
  } catch (error) {
    console.error("Error adding owner:", error);
    res.status(500).json({ error: error.message || "Failed to add owner" });
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
    if (!agent || agent.role !== "union_agent")
      return res.status(404).json({ error: "Agent not found" });

    const apt = await Apartment.findOne({ _id: apartmentId, agent: agent._id });
    if (!apt) return res.status(404).json({ error: "Apartment not found" });

    // Remove embedded owner
    apt.owners.pull({ _id: ownerId });
    await apt.save();

    res.json({ success: true, message: "Owner removed successfully" });
  } catch (error) {
    console.error("Error removing owner:", error);
    res.status(500).json({ error: "Failed to remove owner" });
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
    if (!agent || agent.role !== "union_agent")
      return res.status(404).json({ error: "Agent not found" });

    const apt = await Apartment.findOne({ _id: apartmentId, agent: agent._id });
    if (!apt) return res.status(404).json({ error: "Apartment not found" });

    const ownerSubdoc = apt.owners.id(ownerId);
    if (!ownerSubdoc) return res.status(404).json({ error: "Owner not found" });

    if (updateData.firstName) ownerSubdoc.firstName = updateData.firstName;
    if (updateData.lastName) ownerSubdoc.lastName = updateData.lastName;
    if (updateData.email) ownerSubdoc.email = updateData.email;
    if (updateData.phone) ownerSubdoc.phone = updateData.phone;
    if (updateData.nationalId) ownerSubdoc.nationalId = updateData.nationalId;
    if (updateData.isRepresentative !== undefined)
      ownerSubdoc.isRepresentative = updateData.isRepresentative;

    await apt.save();

    res.json({
      success: true,
      owner: {
        _id: ownerSubdoc._id,
        name: `${ownerSubdoc.firstName} ${ownerSubdoc.lastName}`,
        ...updateData,
      },
    });
  } catch (error) {
    console.error("Error updating owner:", error);
    res.status(500).json({ error: "Failed to update owner" });
  }
};

/**
 * GET /api/property-owners/:apartmentId
 * Get owners for apartment (alternative endpoint)
 */
export const getApartmentOwners = async (req, res) => {
  return getOwnersByApartment(req, res);
};
