// backend/controllers/unionAgentController.js
import UnionAgent from '../models/UnionAgent.js';
import Building from '../models/Building.js';
import Apartment from '../models/Apartment.js';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';


// Helper: Generate next apartment code for an agent
function getNextApartmentCode(prefix, lastCode) {
  // If no apartments, start at 100
  let nextNum = 100;
  if (lastCode) {
    const lastNum = parseInt(lastCode.replace(prefix, ''));
    nextNum = lastNum + 1;
  }
  return `${prefix}${nextNum}`;
}

// Add a new apartment (with owners and credential generation)
export const addApartment = async (req, res) => {
  // Accept the requested fields from frontend
 const {
  building_name,
  apartment_number,
  owners, // ← array of { firstName, lastName }
  real_estate_drawing,
  apartment_space,
  common_parts_space,
  name,
  address,
  type
} = req.body;


  // Basic validation
  if (!building_name || !apartment_number || !owners || owners.length === 0) {
    return res.status(400).json({ error: 'building_name, apartment_number, and owners are required' });
  }

  const agent = await UnionAgent.findOne({ user: req.user.id });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  // Find last apartment code for this agent
  const lastApt = await Apartment.find({ agent: agent._id })
    .sort({ code: -1 })
    .limit(1);
  const code = getNextApartmentCode(agent.prefix, lastApt[0]?.code);

  // Ensure unique email for generated owner email
  const ownerLocalPart = `${apartment_number.toLowerCase()}.${building_name.toLowerCase()}.${owner_first_name.toLowerCase()}`.replace(/\s+/g, '').replace(/[^a-z0-9.\-@]/g, '');
  const email = `${ownerLocalPart}@owner.com`;
  const existing = await User.findOne({ email });
  if (existing) return res.status(409).json({ error: 'Owner email already exists' });

  // Generate random 8-character password
  const genPassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < 8; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  };
  const rawPassword = genPassword();
  const password_hash = await bcrypt.hash(rawPassword, 10);

  // Create apartment record with new fields and link to agent
  const apt = new Apartment({
  code,
  name: name || `${building_name} ${apartment_number}`,
  address,
  type,
  building_name,
  apartment_number,
  real_estate_drawing,
  apartment_space: apartment_space ? Number(apartment_space) : undefined,
  common_parts_space: common_parts_space ? Number(common_parts_space) : undefined,
  owners: [], // will fill below
  residents: [],
  agent: agent._id
});
await apt.save();

  // Create owner user and link
  const ownerName = `${owner_first_name} ${owner_last_name}`.trim();
  const username = `${apartment_number.toLowerCase()}.${building_name.toLowerCase()}.${owner_first_name.toLowerCase()}`.replace(/\s+/g, '');
  const user = new User({
    name: ownerName,
    username,
    email,
    password_hash,
    role: 'property_owner',
    apartment: apt._id,
    status: 'ACTIVE'
  });
  await user.save();

  // Link both ways
  apt.owners.push(user._id);
  apt.owner_user = user._id;
  await apt.save();
  agent.apartments.push(apt._id);
  await agent.save();

  // Return created apartment and owner credentials (raw password returned so agent can share it)
  res.status(201).json({
    apartment: apt,
    owner: { _id: user._id, name: ownerName, username, email },
    credentials: { email, password: rawPassword }
  });
};
// Property owner: get their own apartment and property details
export const getOwnerApartment = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user || user.role !== 'property_owner') return res.status(403).json({ error: 'Forbidden' });
  const apartment = await Apartment.findById(user.apartment)
    .populate('owners', 'name username')
    .populate('residents', 'name username');
  if (!apartment) return res.status(404).json({ error: 'Apartment not found' });
  res.json({ apartment });
};

// List all apartments for this agent
export const listApartments = async (req, res) => {
  const agent = await UnionAgent.findOne({ user: req.user.id });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const apartments = await Apartment.find({ agent: agent._id })
    .populate('owners', 'name username email')
    .populate('residents', 'name username');
  res.json(apartments);
};


export const createBuildingWithApartmentAndOwners = async (req, res) => {
  try {
    const agent = await UnionAgent.findOne({ user: req.user.id });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { building, apartment, owners } = req.body;

    if (!building || !apartment || !Array.isArray(owners) || owners.length === 0) {
      return res.status(400).json({ error: 'Building, apartment, and at least one owner are required' });
    }

    // === 1️⃣ Parse and sanitize building data ===
    const buildingData = {
      name: building.name?.trim(),
      address: building.address?.trim(),
      residenceCode: building.residenceCode?.trim(),
      propertyLandArea: building.propertyLandArea ? parseFloat(building.propertyLandArea) : undefined,
      numberOfBuildings: building.numberOfBuildings ? parseInt(building.numberOfBuildings, 10) : undefined,
      averageUnitsPerBuilding: building.averageUnitsPerBuilding ? parseInt(building.averageUnitsPerBuilding, 10) : undefined,
      averageFloorsPerBuilding: building.averageFloorsPerBuilding ? parseInt(building.averageFloorsPerBuilding, 10) : undefined,
      totalUnits: building.totalUnits ? parseInt(building.totalUnits, 10) : undefined,
      propertyPlanNumber: building.propertyPlanNumber?.trim(),
      hasGarage: building.hasGarage === true || building.hasGarage === 'true' || building.hasGarage === 'yes',
      hasSwimmingPool: building.hasSwimmingPool === true || building.hasSwimmingPool === 'true' || building.hasSwimmingPool === 'yes',
      sharedParts: building.sharedParts?.trim(),
      description: building.description?.trim(),
      estateFeeNumber: building.estateFeeNumber?.trim(),

      // Agent info (embedded object, not reference)
      agent: {
        name: building.agent?.name?.trim() || '',
        company: building.agent?.company?.trim() || ''
      },
      residenceManager: building.residenceManager?.trim(),
      mainOwner: building.mainOwner?.trim() || null, // optional ID string

      // Relationship
      agent: agent._id // ← this is the REF to UnionAgent (required by schema)
    };

    // Validate required fields
    if (!buildingData.name) {
      return res.status(400).json({ error: 'Building name is required' });
    }

    // === 2️⃣ Create Building ===
    const newBuilding = new Building(buildingData);
    await newBuilding.save();

    // === 3️⃣ Create Apartment ===
    const apartmentData = {
  apartment_number: apartment.apartment_number?.trim(),
  floor: apartment.floor ? parseInt(apartment.floor, 10) : undefined,
  space: apartment.space ? parseFloat(apartment.space) : undefined,
  name: apartment.name?.trim() || `${building.name} ${apartment.apartment_number}`,
  type: apartment.type?.trim() || 'residential',
  agent: agent._id,
  building: newBuilding._id
};

    if (!apartmentData.apartment_number) {
      return res.status(400).json({ error: 'Apartment number is required' });
    }

    const newApartment = new Apartment(apartmentData);
    await newApartment.save();

    // === 4️⃣ Create Owners ===
    const createdOwners = [];

    for (const owner of owners) {
      if (!owner.firstName || !owner.lastName) {
        continue; // skip invalid
      }

      const firstName = owner.firstName.trim();
      const lastName = owner.lastName.trim();
      const fullName = `${firstName} ${lastName}`;

      // Generate email & username
      const emailLocal = `${apartmentData.apartment_number.toLowerCase()}.${newBuilding.name.toLowerCase()}.${firstName.toLowerCase()}`.replace(/\s+/g, '').replace(/[^a-z0-9.\-@]/g, '');
      const email = `${emailLocal}@owner.com`;
      const username = emailLocal;

      // Check email uniqueness
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(409).json({ error: `Owner email already exists: ${email}` });
      }

      // Generate password
      const rawPassword = crypto.randomBytes(6).toString('hex');
      const passwordHash = await bcrypt.hash(rawPassword, 10);

      // Create user
      const newUser = new User({
        name: fullName,
        username,
        email,
        password_hash: passwordHash,
        role: 'property_owner',
        apartment: newApartment._id,
        status: 'ACTIVE'
      });

      await newUser.save();

      // Link to apartment
      newApartment.owners.push(newUser._id);

      createdOwners.push({
        name: fullName,
        email,
        password: rawPassword
      });
    }

    // Save apartment with owners
    await newApartment.save();

    // Link apartment to building
    newBuilding.apartments.push(newApartment._id);
    await newBuilding.save();

    // Also link to agent (optional, but good for querying)
    agent.apartments.push(newApartment._id);
    await agent.save();

    // === 🎉 Success ===
    res.status(201).json({
      message: 'Building, apartment, and owners created successfully',
      building: newBuilding,
      apartment: newApartment,
      owners: createdOwners
    });

  } catch (error) {
    console.error('Error in createBuildingWithApartmentAndOwners:', error);
    res.status(500).json({ error: 'Failed to create building setup' });
  }
};


// Add a resident (property owner) to an apartment
export const addResident = async (req, res) => {
  const { apartmentId, userId } = req.body;
  const apt = await Apartment.findOne({ _id: apartmentId, agent: req.user.id });
  if (!apt) return res.status(404).json({ error: 'Apartment not found' });
  if (!apt.residents.includes(userId)) apt.residents.push(userId);
  await apt.save();
  // Link property owner to apartment
  await User.findByIdAndUpdate(userId, { apartment: apt._id });
  res.json(apt);
};

// Remove a resident from an apartment
export const removeResident = async (req, res) => {
  const { apartmentId, userId } = req.body;
  const apt = await Apartment.findOne({ _id: apartmentId, agent: req.user.id });
  if (!apt) return res.status(404).json({ error: 'Apartment not found' });
  apt.residents = apt.residents.filter(r => r.toString() !== userId);
  await apt.save();
  // Unlink property owner from apartment
  await User.findByIdAndUpdate(userId, { $unset: { apartment: 1 } });
  res.json(apt);
};

// Edit apartment details (name)
export const editApartment = async (req, res) => {
  const { apartmentId, name } = req.body;
  const apt = await Apartment.findOneAndUpdate(
    { _id: apartmentId, agent: req.user.id },
    { name },
    { new: true }
  );
  if (!apt) return res.status(404).json({ error: 'Apartment not found' });
  res.json(apt);
};

// Comments in code explain:
// - How apartment codes are generated (prefix + next number)
// - How agent/apartment/user relationships are handled
// - How security is enforced (agent can only manage their own apartments)

// --- Additional endpoints to match frontend usage ---

// DELETE /api/union/apartments/:apartmentId
export const deleteApartment = async (req, res) => {
  const { apartmentId } = req.params;
  const agent = await UnionAgent.findOne({ user: req.user.id });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const apt = await Apartment.findOneAndDelete({ _id: apartmentId, agent: agent._id });
  if (!apt) return res.status(404).json({ error: 'Apartment not found' });

  // Remove ref from agent
  agent.apartments = agent.apartments.filter(a => a.toString() !== apartmentId);
  await agent.save();

  // If caller asked to delete users as well, remove owner/resident user documents;
  // otherwise just unlink their apartment field.
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
};

// DELETE /api/union/apartments/:apartmentId/owner/:ownerId
export const removeOwnerFromApartment = async (req, res) => {
  const { apartmentId, ownerId } = req.params;
  const agent = await UnionAgent.findOne({ user: req.user.id });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const apt = await Apartment.findOne({ _id: apartmentId, agent: agent._id });
  if (!apt) return res.status(404).json({ error: 'Apartment not found' });
  apt.owners = apt.owners.filter(o => o.toString() !== ownerId);
  await apt.save();
  await User.findByIdAndUpdate(ownerId, { $unset: { apartment: 1 } });
  res.json(apt);
};

// PUT /api/union/apartments/:apartmentId/owner/:ownerId
export const updateOwnerInfo = async (req, res) => {
  const { apartmentId, ownerId } = req.params;
  const { name, email, username } = req.body || {};
  const agent = await UnionAgent.findOne({ user: req.user.id });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const apt = await Apartment.findOne({ _id: apartmentId, agent: agent._id });
  if (!apt) return res.status(404).json({ error: 'Apartment not found' });
  const user = await User.findByIdAndUpdate(ownerId, { name, email, username }, { new: true });
  if (!user) return res.status(404).json({ error: 'Owner not found' });
  res.json(user);
};

// POST /api/union/apartments/:apartmentId/owner
export const addOwnerToApartment = async (req, res) => {
  const { apartmentId } = req.params;
  const { firstName, lastName } = req.body || {};
  if (!firstName || !lastName) return res.status(400).json({ error: 'firstName and lastName required' });
  const agent = await UnionAgent.findOne({ user: req.user.id });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const apt = await Apartment.findOne({ _id: apartmentId, agent: agent._id });
  if (!apt) return res.status(404).json({ error: 'Apartment not found' });

  const ownerName = `${firstName} ${lastName}`.trim();
  const username = `${firstName}${lastName}${apt.code}`.replace(/\s+/g, '');
  const rawPassword = `${firstName}${lastName}${apt._id}`;
  const password_hash = await bcrypt.hash(rawPassword, 10);
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${apt.code.toLowerCase()}@owners.iqamati.local`;
  const user = new User({ name: ownerName, username, email, password_hash, role: 'property_owner', apartment: apt._id, status: 'ACTIVE' });
  await user.save();
  apt.owners.push(user._id);
  await apt.save();
  res.status(201).json({ owner: { _id: user._id, name: ownerName, username, email }, credentials: { username, password: rawPassword } });
};

// POST /api/union/apartments/owner-by-name
// Body: { apartmentName, building_name (optional), firstName, lastName }
export const addOwnerByApartmentName = async (req, res) => {
  const { apartmentName, building_name, firstName, lastName } = req.body || {};
  if (!apartmentName || !firstName || !lastName) return res.status(400).json({ error: 'apartmentName, firstName and lastName required' });

  const agent = await UnionAgent.findOne({ user: req.user.id });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  // Try to find an apartment for this agent that matches by apartment_number or name (case-insensitive)
  const match = {
    agent: agent._id,
    $or: [
      { apartment_number: new RegExp(`^${apartmentName}$`, 'i') },
      { name: new RegExp(`^${apartmentName}$`, 'i') }
    ]
  };
  if (building_name) match.building_name = new RegExp(`^${building_name}$`, 'i');

  let apt = await Apartment.findOne(match);

  // If apartment not found: if building_name provided, create the apartment; otherwise return 404
  if (!apt) {
    if (!building_name) return res.status(404).json({ error: 'Apartment not found. Provide building_name to create it.' });

    // Create a minimal apartment record under this agent
    // Generate next code similar to addApartment
    const lastApt = await Apartment.find({ agent: agent._id }).sort({ code: -1 }).limit(1);
    const code = getNextApartmentCode(agent.prefix, lastApt[0]?.code);
    apt = new Apartment({
      code,
      name: `${building_name} ${apartmentName}`,
      building_name,
      apartment_number: apartmentName,
      owners: [],
      residents: [],
      agent: agent._id
    });
    await apt.save();
    agent.apartments.push(apt._id);
    await agent.save();
  }

  // Create owner user and link (reuse pattern from addOwnerToApartment)
  const ownerName = `${firstName} ${lastName}`.trim();
  const username = `${firstName}${lastName}${apt.code}`.replace(/\s+/g, '');
  const rawPassword = `${firstName}${lastName}${apt._id}`;
  const password_hash = await bcrypt.hash(rawPassword, 10);
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${apt.code.toLowerCase()}@owners.iqamati.local`;

  // Ensure email uniqueness; if exists, return conflict
  const existingUser = await User.findOne({ email });
  if (existingUser) return res.status(409).json({ error: 'Owner email already exists' });

  const user = new User({ name: ownerName, username, email, password_hash, role: 'property_owner', apartment: apt._id, status: 'ACTIVE' });
  await user.save();
  apt.owners.push(user._id);
  apt.owner_user = apt.owner_user || user._id;
  await apt.save();

  res.status(201).json({ owner: { _id: user._id, name: ownerName, username, email }, credentials: { username, password: rawPassword }, apartment: apt });
};

// DELETE /api/union/buildings/:buildingName
// Deletes all apartments in a building for the current agent and their owner/resident users
export const deleteBuilding = async (req, res) => {
  const { buildingName } = req.params;
  const agent = await UnionAgent.findOne({ user: req.user.id });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const nameRegex = new RegExp(`^${String(buildingName).trim()}$`, 'i');
  const apartments = await Apartment.find({ agent: agent._id, building_name: nameRegex });
  if (!apartments || apartments.length === 0) {
    return res.status(404).json({ error: 'No apartments found for this building' });
  }

  const aptIds = apartments.map(a => a._id);
  // collect owner/resident ids
  const userIds = [];
  for (const a of apartments) {
    if (Array.isArray(a.owners)) userIds.push(...a.owners.map(x => x.toString()));
    if (Array.isArray(a.residents)) userIds.push(...a.residents.map(x => x.toString()));
  }

  // Remove apartments
  await Apartment.deleteMany({ _id: { $in: aptIds } });

  // Remove users referenced (owners/residents)
  if (userIds.length > 0) {
    // dedupe
    const uniqueUserIds = [...new Set(userIds)];
    await User.deleteMany({ _id: { $in: uniqueUserIds } });
  }

  // Remove references from agent.apartments
  agent.apartments = (agent.apartments || []).filter(aid => !aptIds.some(x => x.toString() === aid.toString()));
  await agent.save();

  res.json({ success: true, deletedApartments: aptIds.length, deletedUsers: userIds.length });
};