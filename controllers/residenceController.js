import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Residence from "../models/Residence.js";
import Building from "../models/Building.js";
import Apartment from "../models/Apartment.js";
import User from "../models/User.js";

/**
 * POST /api/residences/create
 * Creates a full residence: Residence → Buildings → Apartments + Owners
 * For إقامة union type: each apartment has share_building + share_residence
 */
export const createResidenceWithBuildingsAndApartments = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const agent = await User.findById(req.user.id).session(session);
    if (!agent || agent.role !== "union_agent") {
      throw new Error("Agent user not found or invalid role");
    }

    const { residence, buildings } = req.body;

    if (!residence?.name || !residence?.address) {
      throw new Error("Residence name and address are required");
    }
    if (!Array.isArray(buildings) || buildings.length === 0) {
      throw new Error("At least one building is required");
    }

    // 1. Create Residence
    const newResidence = new Residence({
      name: residence.name.trim(),
      address: residence.address.trim(),
      city: residence.city?.trim(),
      agent: agent._id,
      buildings: [],
    });
    await newResidence.save({ session });

    const createdBuildingIds = [];
    const allCreatedOwners = [];

    // 2. For each building
    for (const bldObj of buildings) {
      const { building: bldDetails, apartments } = bldObj;

      if (!bldDetails?.name) throw new Error("Each building must have a name");
      if (!Array.isArray(apartments) || apartments.length === 0) {
        throw new Error(`Building "${bldDetails.name}" must have at least one apartment`);
      }

      const newBuilding = new Building({
        building_name: bldDetails.name.trim(),
        building_address: residence.address.trim(),
        original_title_number: bldDetails.title_number?.trim(),
        propertyPlanNumber: bldDetails.title_number?.trim(),
        avg_floors_per_block: bldDetails.floors ? parseInt(bldDetails.floors, 10) : undefined,
        union_type: "residence",
        residence: newResidence._id,
        agent: agent._id,
        apartments: [],
      });
      await newBuilding.save({ session });
      createdBuildingIds.push(newBuilding._id);

      // 3. For each apartment in this building
      for (const aptObj of apartments) {
        const { apartment: aptDetails, owners: ownersList } = aptObj;

        if (!aptDetails?.apartment_number) {
          throw new Error(`All apartments in building "${bldDetails.name}" must have a unit number`);
        }
        if (!Array.isArray(ownersList) || ownersList.length === 0) {
          throw new Error(`Apartment "${aptDetails.apartment_number}" must have at least one owner`);
        }

        const apartmentData = {
          unit_code: aptDetails.apartment_number.trim(),
          area_sqm: aptDetails.space ? parseFloat(aptDetails.space) : undefined,
          floor: aptDetails.floor ? parseInt(aptDetails.floor, 10) : undefined,
          usage_type: aptDetails.type || "residential",
          main_plot_number: bldDetails.title_number?.trim() || "",
          sub_title_number: aptDetails.sub_title_number?.trim() || undefined,
          share_building: aptDetails.share_building ? parseFloat(aptDetails.share_building) : undefined,
          share_residence: aptDetails.share_residence ? parseFloat(aptDetails.share_residence) : undefined,
          building: newBuilding._id,
          agent: agent._id,
          owners: [],
          ownerCredentials: [],
        };

        const newApartment = new Apartment(apartmentData);
        await newApartment.save({ session });

        // Process owners: only representative becomes a User
        let repIndex = ownersList.findIndex((o) => o.isRepresentative);
        if (repIndex === -1) repIndex = 0;

        const embeddedOwners = ownersList.map((o) => ({
          firstName: o.firstName?.trim() || "",
          lastName: o.lastName?.trim() || "",
          nationalId: o.nationalId?.trim() || "",
          email: o.email?.trim() || "",
          phone: o.phone?.trim() || "",
          isRepresentative: !!o.isRepresentative,
        }));

        const repOwner = ownersList[repIndex];
        const firstName = repOwner.firstName.trim();
        const lastName = repOwner.lastName.trim();
        const nationalId = repOwner.nationalId.trim();

        if (!firstName || !lastName || !nationalId) {
          throw new Error(
            `Representative owner of apartment "${aptDetails.apartment_number}" must have first name, last name, and national ID`
          );
        }

        const emailLocal =
          `${apartmentData.unit_code.toLowerCase()}.${newBuilding.building_name.toLowerCase()}.${firstName.toLowerCase()}`
            .replace(/\s+/g, "")
            .replace(/[^a-z0-9.\-@]/g, "");
        const repEmail = `${emailLocal}@owner.com`;

        const existingUser = await User.findOne({ email: repEmail }).session(session);
        if (existingUser) throw new Error(`Representative email already exists: ${repEmail}`);

        const hashedPassword = await bcrypt.hash(nationalId, 10);
        const newUser = new User({
          name: `${firstName} ${lastName}`,
          email: repEmail,
          password_hash: hashedPassword,
          nationalId,
          role: "property_owner",
          status: "ACTIVE",
        });
        await newUser.save({ session });

        newApartment.representativeUser = newUser._id;
        newApartment.ownerCredentials.push({
          owner: newUser._id,
          email: repEmail,
          password: nationalId,
        });
        embeddedOwners[repIndex] = { ...embeddedOwners[repIndex], email: repEmail };

        newApartment.owners = embeddedOwners;
        await newApartment.save({ session });

        newBuilding.apartments.push(newApartment._id);

        allCreatedOwners.push({
          name: `${firstName} ${lastName}`,
          email: repEmail,
          password: nationalId,
          apartment: aptDetails.apartment_number,
          building: bldDetails.name,
        });
      }

      await newBuilding.save({ session });
    }

    // Link buildings to residence
    newResidence.buildings = createdBuildingIds;
    await newResidence.save({ session });

    await session.commitTransaction();

    res.status(201).json({
      message: `Residence "${newResidence.name}" created with ${createdBuildingIds.length} building(s)`,
      residence: newResidence,
      buildingCount: createdBuildingIds.length,
      owners: allCreatedOwners,
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ error: error.message || "Failed to create residence" });
  } finally {
    session.endSession();
  }
};

/**
 * GET /api/residences
 */
export const getResidences = async (req, res) => {
  try {
    const residences = await Residence.find({ agent: req.user.id })
      .populate("buildings", "building_name building_address original_title_number apartments")
      .sort({ created_at: -1 });

    res.json({ data: residences });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
