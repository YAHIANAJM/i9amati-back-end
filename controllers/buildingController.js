import Building from "../models/Building.js";
import Apartment from "../models/Apartment.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import emailService from "../services/emailService.js";
import bcrypt from "bcryptjs";
import Group from "../models/Group.js";
import crypto from "crypto";
import mongoose from "mongoose";

// ─── Credential encryption helpers ──────────────────────────────────────────
// Encrypts a credential (e.g. CIN) with AES-256-GCM so it can be decrypted
// by the union agent but is never stored as plaintext.
const CRED_KEY = Buffer.from(
  (process.env.CREDENTIAL_ENCRYPTION_KEY || '').padEnd(64, '0').slice(0, 64),
  'hex'
);

function encryptCredential(plaintext) {
  if (!process.env.CREDENTIAL_ENCRYPTION_KEY) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY is not set');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', CRED_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptCredential(ciphertext) {
  const [ivHex, tagHex, dataHex] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', CRED_KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final('utf8');
}

/**
 * Notify a union agent that another building declared shared parts with theirs.
 * Sends both an in-app notification and an email. Errors are swallowed so they
 * never break the main building-creation flow.
 */
async function notifySharedParts(recipientAgentId, newBuilding, theirBuilding, session = null) {
  try {
    const recipient = await User.findById(recipientAgentId).select("name email").session(session);
    const sender = await User.findById(newBuilding.agent).select("name email").session(session);
    if (!recipient || !sender) return;

    const newBldName = newBuilding.building_name || newBuilding.propertyPlanNumber || "عمارة جديدة";
    const theirBldName = theirBuilding.building_name || theirBuilding.propertyPlanNumber || "عمارتكم";


    // 1️⃣  In-app notification for the RECIPIENT
    await Notification.create(
      [
        {
          user: recipient._id,
          title: "إشعار: أجزاء مشتركة (قيد المراجعة)",
          message: `تفيدكم إدارة "${newBldName}" (الوكيل: ${sender.name}) بأن لديها أجزاء مشتركة مع "${theirBldName}". يرجى انتظار رفع الوثيقة القانونية من طرفهم للمراجعة والقبول.`,
          type: "document",
          priority: "high",
          reference_id: newBuilding._id,
          reference_type: "Building",
          metadata: {
            action: "view_shared_parts_claim",
            newBuildingId: newBuilding._id,
            senderName: sender.name,
          },
        },
      ],
      { session },
    );

    // 2️⃣  In-app notification for the SENDER
    await Notification.create(
      [
        {
          user: sender._id,
          title: "تذكير: رفع وثيقة الأجزاء المشتركة",
          message: `لقد صرحتم بوجود أجزاء مشتركة مع "${theirBldName}". يرجى رفع الوثيقة القانونية المثبتة لذلك ليتمكن الوكيل "${recipient.name}" من مراجعتها وقبول الربط.`,
          type: "document",
          priority: "high",
          reference_id: newBuilding._id,
          reference_type: "Building",
          metadata: {
            action: "upload_shared_parts_document",
            recipientName: recipient.name,
          },
        },
      ],
      { session },
    );

    // 3️⃣ Email notification for the RECIPIENT
    await emailService.sendEmail({
      to: recipient.email,
      subject: `I9amati — أجزاء مشتركة: "${newBldName}"`,
      text: `مرحباً ${recipient.name}،\n\nتفيدكم إدارة "${newBldName}" (الوكيل: ${sender.name}) بأن لديها أجزاء مشتركة مع "${theirBldName}".\nيرجى انتظار رفع الوثيقة القانونية من طرفهم للمراجعة والقبول.`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #eee;border-radius:10px;direction:rtl">
          <h2 style="color:#0d9488">إشعار: ادعاء أجزاء مشتركة</h2>
          <p>مرحباً <strong>${recipient.name}</strong>،</p>
          <p>تفيدكم إدارة <strong>"${newBldName}"</strong> (الوكيل: <strong>${sender.name}</strong>) بأن لديها أجزاء مشتركة مع <strong>"${theirBldName}"</strong>.</p>
          <p>يرجى انتظار قيام الوكيل الآخر برفع الوثيقة القانونية المثبتة لذلك في قسم الوثائق ليتسنى لكم مراجعتها وقبول الربط أو رفضه.</p>
          <div style="text-align:center;margin-top:30px">
            <a href="${process.env.FRONTEND_URL}/notifications" style="background-color:#0d9488;color:white;padding:12px 24px;text-decoration:none;border-radius:5px;font-weight:bold">عرض الإشعارات</a>
          </div>
          <hr style="margin-top:40px;border:0;border-top:1px solid #eee"/>
          <p style="font-size:12px;color:#6b7280;text-align:center">I9amati Platform — إشعار تلقائي</p>
        </div>`,
    });

    console.log(`[SharedParts] ✅ SUCCESS: Notified both recipient (${recipient.email}) and sender (${sender.email})`);
  } catch (err) {
    console.warn("[SharedParts] ⚠️ Notification failed (non-blocking):", err.message);
  }
}

/**
 * GET /api/buildings
 * Get all buildings with pagination (10 per page)
 * Returns only building details, NO apartments populated
 */
export const getBuildings = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { searchBuilding, searchApartment, searchOwner } = req.query;
    let query = { agent: new mongoose.Types.ObjectId(req.user.id) };

    // Escape special regex characters to prevent ReDoS / injection
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 1. Filter by Building Name or Code
    if (searchBuilding) {
      const safe = escapeRegex(searchBuilding);
      query.$or = [
        { building_name: { $regex: safe, $options: "i" } },
        { building_code: { $regex: safe, $options: "i" } },
      ];
    }

    // 2. Filter by Apartment Code or Owner Name
    if (searchApartment || searchOwner) {
      let apartmentQuery = {};
      if (searchApartment) {
        apartmentQuery.unit_code = { $regex: escapeRegex(searchApartment), $options: "i" };
      }
      if (searchOwner) {
        const safeOwner = escapeRegex(searchOwner);
        apartmentQuery.$or = [
          { "owners.firstName": { $regex: safeOwner, $options: "i" } },
          { "owners.lastName": { $regex: safeOwner, $options: "i" } },
        ];
      }

      const matchingApartments = await Apartment.find(apartmentQuery)
        .select("building")
        .lean();
      const buildingIds = matchingApartments.map((a) => a.building);

      if (query.$or) {
        // combine with building name search if both provided
        query = { $and: [query, { _id: { $in: buildingIds } }] };
      } else {
        query._id = { $in: buildingIds };
      }
    }

    // Use aggregation to get counts efficiently for the paginated set
    const buildingsData = await Building.aggregate([
      { $match: query },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "apartments",
          localField: "apartments",
          foreignField: "_id",
          as: "aptDetails",
        },
      },
      {
        $lookup: {
          from: "residences",
          localField: "residence",
          foreignField: "_id",
          as: "residenceInfo",
        },
      },
      {
        $addFields: {
          apartmentCount: { $size: "$apartments" },
          ownerCount: {
            $reduce: {
              input: "$aptDetails",
              initialValue: 0,
              in: { $add: ["$$value", { $size: "$$this.owners" }] },
            },
          },
          residenceName: { $arrayElemAt: ["$residenceInfo.name", 0] },
          residenceId: { $arrayElemAt: ["$residenceInfo._id", 0] },
        },
      },
      { $project: { aptDetails: 0, residenceInfo: 0 } },
    ]);

    const totalCount = await Building.countDocuments(query);

    // Map DB fields to API-friendly keys
    const normalizedBuildings = buildingsData.map((b) => ({
      _id: b._id,
      building_code: b.building_code || null,
      building_name: b.building_name || null,
      building_address: b.building_address || null,
      propertyLandArea: b.land_area_sqm ?? null,
      averageUnitsPerBuilding: b.avg_units_per_block ?? null,
      averageFloorsPerBuilding: b.avg_floors_per_block ?? null,
      propertyPlanNumber:
        b.propertyPlanNumber || b.original_title_number || null,
      hasGarage: Boolean(b.has_garage),
      hasSwimmingPool: Boolean(b.has_pool),
      hasElevator: Boolean(b.hasElevator || b.has_elevator),
      hasSharedParts: Boolean(
        b.hasSharedParts || b.has_shared_parts_with_other_buildings,
      ),
      sharedWithTitleDeed: b.sharedWithTitleDeed ?? null,
      sharedParts: b.sharedParts ?? null,
      totalUnits: b.total_units ?? null,
      numberOfBuildings: b.number_of_blocks ?? null,
      documents: b.documents || [],
      description: b.description || null,
      agent: b.agent || null,
      apartments: b.apartments || [],
      apartmentCount: b.apartmentCount || 0,
      ownerCount: b.ownerCount || 0,
      union_type: b.union_type || 'immeuble',
      residenceId: b.residenceId || null,
      residenceName: b.residenceName || null,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));

    res.status(200).json({
      success: true,
      data: normalizedBuildings,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalBuildings: totalCount,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching buildings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve buildings",
      error: error.message,
    });
  }
};

/**
 * GET /api/buildings/:id
 * Get single building by ID
 */
export const getBuildingById = async (req, res) => {
  try {
    const { buildingId } = req.params;
    console.log(buildingId);
    const building = await Building.findById(buildingId).lean();

    if (!building) {
      return res.status(404).json({
        success: false,
        message: "Building not found",
      });
    }

    res.status(200).json({
      success: true,
      data: building,
    });
  } catch (error) {
    console.error("Error fetching building:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve building",
      error: error.message,
    });
  }
};

/**
 * POST /api/buildings/createBuildingWithApartmentAndOwners
 * Create building + apartment + owners in one transaction
 */
export const createBuildingWithApartmentAndOwners = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1️⃣ Get the authenticated union agent user (now using User model)
    const agent = await User.findById(req.user.id).session(session);
    if (!agent || agent.role !== "union_agent") {
      throw new Error("Agent user not found or invalid role");
    }

    const { building, apartment, owners } = req.body;

    if (
      !building ||
      !apartment ||
      !Array.isArray(owners) ||
      owners.length === 0
    ) {
      throw new Error(
        "Building, apartment, and at least one owner are required",
      );
    }

    // Enforce new plot identifier: require main_plot_number
    if (!apartment.main_plot_number || !apartment.main_plot_number.trim()) {
      throw new Error(
        "Apartment must include 'main_plot_number' (canonical plot identifier)",
      );
    }

    // Optional numeric fields from frontend for single apartment
    if (
      apartment.division_number !== undefined &&
      apartment.division_number !== null
    ) {
      const dn = Number(apartment.division_number);
      if (!Number.isInteger(dn) || dn < 1)
        throw new Error("'division_number' must be an integer >= 1");
      apartment.division_number = dn;
    }

    if (
      apartment.land_share_area !== undefined &&
      apartment.land_share_area !== null
    ) {
      const la = Number(apartment.land_share_area);
      if (Number.isNaN(la) || la < 0)
        throw new Error("'land_share_area' must be a number >= 0");
      apartment.land_share_area = la;
    }

    // 2️⃣ Create building with correct field mapping
    const buildingData = {
      building_name: building.name?.trim(),
      building_address: building.address?.trim(),
      land_area_sqm: building.propertyLandArea
        ? parseFloat(building.propertyLandArea)
        : undefined,
      number_of_blocks: building.numberOfBuildings
        ? parseInt(building.numberOfBuildings, 10)
        : undefined,
      avg_units_per_block: building.averageUnitsPerBuilding
        ? parseInt(building.averageUnitsPerBuilding, 10)
        : undefined,
      avg_floors_per_block: building.averageFloorsPerBuilding
        ? parseInt(building.averageFloorsPerBuilding, 10)
        : undefined,
      total_units: building.totalUnits
        ? parseInt(building.totalUnits, 10)
        : undefined,
      original_title_number: building.propertyPlanNumber?.trim(),
      propertyPlanNumber: building.propertyPlanNumber?.trim(), // FIX: Map this to the actual field used for linking
      has_garage:
        building.hasGarage === true ||
        building.hasGarage === "true" ||
        building.hasGarage === "yes",
      has_pool:
        building.hasSwimmingPool === true ||
        building.hasSwimmingPool === "true" ||
        building.hasSwimmingPool === "yes",
      hasElevator:
        building.hasElevator === true ||
        building.hasElevator === "true" ||
        building.hasElevator === "yes",
      has_elevator:
        building.hasElevator === true ||
        building.hasElevator === "true" ||
        building.hasElevator === "yes",
      has_shared_parts_with_other_buildings:
        building.sharedParts?.trim() &&
        building.sharedParts.trim().toLowerCase() !== "none",
      description: building.description?.trim(),
      agent: agent._id,
    };

    console.log(`[SharedParts] Creating new building "${buildingData.building_name}" with plan: ${buildingData.propertyPlanNumber}`);

    const newBuilding = new Building(buildingData);
    await newBuilding.save({ session });

    // --- Shared-title linking logic ---
    try {
      const referencedPlan =
        building.sharedWithTitleDeed?.trim() ||
        building.shared_with_title_deed?.trim();

      if (referencedPlan) {
        console.log(`[SharedParts] Found claim: Shared parts with plan "${referencedPlan}"`);
        const existingSharedBuilding = await Building.findOne({
          propertyPlanNumber: referencedPlan,
          _id: { $ne: newBuilding._id },
        }).session(session);

        if (existingSharedBuilding) {
          console.log(`[SharedParts] SUCCESS: Target building "${existingSharedBuilding.building_name || existingSharedBuilding.propertyPlanNumber}" found.`);
          await Building.findByIdAndUpdate(
            newBuilding._id,
            { hasSharedParts: true, sharedWithTitleDeed: referencedPlan },
            { session },
          );
          await Building.findByIdAndUpdate(
            existingSharedBuilding._id,
            {
              hasSharedParts: true,
              sharedWithTitleDeed: newBuilding.propertyPlanNumber || building.propertyPlanNumber?.trim(),
            },
            { session },
          );
          // Notify the other building's agent
          if (existingSharedBuilding.agent) {
             console.log(`[SharedParts] Triggering notification to agent: ${existingSharedBuilding.agent}`);
             await notifySharedParts(existingSharedBuilding.agent, newBuilding, existingSharedBuilding, session);
          }
        } else {
          console.log(`[SharedParts] INFO: Target building with plan "${referencedPlan}" not found yet. Saving claim as pending.`);
          await Building.findByIdAndUpdate(
            newBuilding._id,
            { hasSharedParts: true, sharedWithTitleDeed: referencedPlan },
            { session },
          );
        }
      }

      // Mutual confirmation check
      if (newBuilding.propertyPlanNumber) {
        const pendingBuildings = await Building.find({
          sharedWithTitleDeed: newBuilding.propertyPlanNumber,
          hasSharedParts: true,
          _id: { $ne: newBuilding._id },
        }).session(session);

        if (pendingBuildings.length > 0) {
           console.log(`[SharedParts] Found ${pendingBuildings.length} pending buildings that were waiting for THIS plan.`);
        }

        for (const pending of pendingBuildings) {
          console.log(`[SharedParts] Activating link for building: ${pending.building_name}`);
          await Building.findByIdAndUpdate(
            pending._id,
            { hasSharedParts: true, sharedWithTitleDeed: pending.propertyPlanNumber },
            { session },
          );
          await Building.findByIdAndUpdate(
            newBuilding._id,
            { hasSharedParts: true, sharedWithTitleDeed: pending.propertyPlanNumber },
            { session },
          );
          if (pending.agent) {
            console.log(`[SharedParts] Notifying agent: ${pending.agent}`);
            await notifySharedParts(pending.agent, newBuilding, pending, session);
          }
        }
      }
    } catch (linkErr) {
      console.warn(" [SharedParts] Linking logic failed:", linkErr.message);
    }

    // 3️⃣ Create apartment with correct field mapping
    const apartmentData = {
      unit_code: apartment.apartment_number?.trim(),
      unit_description: apartment.ownership_status?.trim(),
      registration_number: apartment.main_plot_number?.trim(),
      // optional numeric division number
      division_number:
        apartment.division_number !== undefined
          ? apartment.division_number
          : undefined,

      area_sqm: apartment.space ? parseFloat(apartment.space) : undefined,
      floor: apartment.floor ? parseInt(apartment.floor, 10) : undefined,
      usage_type: apartment.type?.trim() || "residential",

      land_share_ratio: apartment.share_percentage
        ? `${apartment.share_percentage}%`
        : undefined,
      land_share_area:
        apartment.land_share_area !== undefined
          ? apartment.land_share_area
          : undefined,

      building: newBuilding._id,
      agent: agent._id,
      owners: [], // Will be populated below
      ownerCredentials: [], // Will be populated below
    };

    const newApartment = new Apartment(apartmentData);
    await newApartment.save({ session });

    // 4️⃣ Create owners and link them correctly
    const embeddedOwners = [];
    let representativeUser = null;
    let repIndex = -1;

    // First, identify the representative owner
    for (let i = 0; i < owners.length; i++) {
      if (owners[i].isRepresentative) {
        repIndex = i;
        break;
      }
    }
    // Default to the first owner if none marked
    if (repIndex === -1 && owners.length > 0) {
      repIndex = 0;
      owners[0].isRepresentative = true;
    }

    const createdCredentials = [];

    for (let i = 0; i < owners.length; i++) {
      const owner = owners[i];
      if (!owner.firstName || !owner.lastName) continue;

      const firstName = owner.firstName.trim();
      const lastName = owner.lastName.trim();
      const fullName = `${firstName} ${lastName}`;
      const nationalId = owner.nationalId?.trim() || "";

      // Generate system email
      const emailLocal =
        `${apartmentData.unit_code.toLowerCase()}.${newBuilding.building_name.toLowerCase()}.${firstName.toLowerCase()}`
          .replace(/\s+/g, "")
          .replace(/[^a-z0-9.\-@]/g, "");
      const email = `${emailLocal}@owner.com`;

      // If this is the representative, create a User account
      if (i === repIndex) {
        const existingUser = await User.findOne({ email }).session(session);
        if (existingUser)
          throw new Error(`Representative email already exists: ${email}`);

        const hashedPassword = await bcrypt.hash(nationalId, 10);
        representativeUser = new User({
          name: fullName,
          email: email,
          password_hash: hashedPassword,
          nationalId: nationalId,
          role: "property_owner",
          status: "ACTIVE",
        });
        await representativeUser.save({ session });

        // Store credentials for retrieval
        newApartment.ownerCredentials.push({
          owner: representativeUser._id,
          email: email,
          password: encryptCredential(nationalId), // AES-256 encrypted
        });
        newApartment.representativeUser = representativeUser._id;

        createdCredentials.push({
          name: fullName,
          email: email,
          password: nationalId,
          isRepresentative: true,
        });
      }

      // Add to embedded owners array
      embeddedOwners.push({
        firstName,
        lastName,
        nationalId,
        email: i === repIndex ? email : owner.email || "", // Use generated email for rep
        phone: owner.phone || "",
        isRepresentative: i === repIndex,
      });
    }

    newApartment.owners = embeddedOwners;
    await newApartment.save({ session });

    // 5️⃣ Link apartment to building
    newBuilding.apartments.push(newApartment._id);
    await newBuilding.save({ session });

    // 6️⃣ Link apartment to agent user
    if (!agent.apartments) agent.apartments = [];
    agent.apartments.push(newApartment._id);
    await agent.save({ session });

    // 7️⃣ Create private group and add representative
    const groupName = `${newBuilding.building_name} - Private Group`;
    const groupDescription = `Private discussion group for residents of ${newBuilding.building_name}`;

    const newGroup = new Group({
      name: groupName,
      description: groupDescription,
      managers: [req.user.id],
      is_active: true,
    });

    await newGroup.save({ session });

    if (representativeUser) {
      representativeUser.groups = representativeUser.groups || [];
      representativeUser.groups.push(newGroup._id);
      await representativeUser.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message:
        "Building, apartment, owners, and private group created successfully",
      building: newBuilding,
      apartment: newApartment,
      owners: createdCredentials, // return rep credentials
      group: {
        _id: newGroup._id,
        name: newGroup.name,
        description: newGroup.description,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error in createBuildingWithApartmentAndOwners:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to create building setup" });
  }
};

export const createBuildingWithMultipleApartments = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1️⃣ Get the authenticated union agent user
    const agent = await User.findById(req.user.id).session(session);
    if (!agent || agent.role !== "union_agent") {
      throw new Error("Agent user not found or invalid role");
    }

    const { building, apartments } = req.body;

    if (!building || !Array.isArray(apartments) || apartments.length === 0) {
      throw new Error(
        "Building details and at least one apartment with owners are required",
      );
    }

    // 2️⃣ Create building
    const buildingData = {
      building_name: building.name?.trim(),
      building_address: building.address?.trim(),
      land_area_sqm: building.propertyLandArea
        ? parseFloat(building.propertyLandArea)
        : undefined,
      number_of_blocks: building.numberOfBuildings
        ? parseInt(building.numberOfBuildings, 10)
        : undefined,
      avg_units_per_block: building.averageUnitsPerBuilding
        ? parseInt(building.averageUnitsPerBuilding, 10)
        : undefined,
      avg_floors_per_block: building.averageFloorsPerBuilding
        ? parseInt(building.averageFloorsPerBuilding, 10)
        : undefined,
      total_units: building.totalUnits
        ? parseInt(building.totalUnits, 10)
        : undefined,
      original_title_number: building.propertyPlanNumber?.trim(),
      propertyPlanNumber: building.propertyPlanNumber?.trim(),
      has_garage: Boolean(building.hasGarage),
      has_pool: Boolean(building.hasSwimmingPool),
      has_elevator: Boolean(building.hasElevator),
      hasElevator: Boolean(building.hasElevator),
      hasSharedParts: Boolean(building.hasSharedParts),
      sharedWithTitleDeed: building.hasSharedParts
        ? building.sharedWithTitleDeed?.trim() || null
        : null,
      description: building.description?.trim(),
      agent: agent._id,
    };

    const newBuilding = new Building(buildingData);
    await newBuilding.save({ session });

    console.log(`[SharedParts] Creating new building (multi-apt) "${newBuilding.building_name}" with plan: ${newBuilding.propertyPlanNumber}`);

    // --- Shared-title linking logic ---
    try {
      const referencedPlan =
        building.sharedWithTitleDeed?.trim() ||
        building.shared_with_title_deed?.trim();

      if (referencedPlan) {
        console.log(`[SharedParts] Found claim: Shared parts with plan "${referencedPlan}"`);
        const existingSharedBuilding = await Building.findOne({
          propertyPlanNumber: referencedPlan,
          _id: { $ne: newBuilding._id },
        }).session(session);

        if (existingSharedBuilding) {
          console.log(`[SharedParts] SUCCESS: Target building "${existingSharedBuilding.building_name || existingSharedBuilding.propertyPlanNumber}" found.`);
          await Building.findByIdAndUpdate(
            newBuilding._id,
            { hasSharedParts: true, sharedWithTitleDeed: referencedPlan },
            { session },
          );
          await Building.findByIdAndUpdate(
            existingSharedBuilding._id,
            {
              hasSharedParts: true,
              sharedWithTitleDeed: newBuilding.propertyPlanNumber || building.propertyPlanNumber?.trim(),
            },
            { session },
          );
          // Notify the other building's agent
          if (existingSharedBuilding.agent) {
             console.log(`[SharedParts] Triggering notification to agent: ${existingSharedBuilding.agent}`);
             await notifySharedParts(existingSharedBuilding.agent, newBuilding, existingSharedBuilding, session);
          }
        } else {
          console.log(`[SharedParts] INFO: Target building with plan "${referencedPlan}" not found yet. Saving claim as pending.`);
          await Building.findByIdAndUpdate(
            newBuilding._id,
            { hasSharedParts: true, sharedWithTitleDeed: referencedPlan },
            { session },
          );
        }
      }

      // Mutual confirmation check
      if (newBuilding.propertyPlanNumber) {
        const pendingBuildings = await Building.find({
          sharedWithTitleDeed: newBuilding.propertyPlanNumber,
          hasSharedParts: true,
          _id: { $ne: newBuilding._id },
        }).session(session);

        if (pendingBuildings.length > 0) {
           console.log(`[SharedParts] Found ${pendingBuildings.length} pending buildings that were waiting for THIS plan.`);
        }

        for (const pending of pendingBuildings) {
          console.log(`[SharedParts] Activating link for building: ${pending.building_name}`);
          await Building.findByIdAndUpdate(
            pending._id,
            { hasSharedParts: true, sharedWithTitleDeed: pending.propertyPlanNumber },
            { session },
          );
          await Building.findByIdAndUpdate(
            newBuilding._id,
            { hasSharedParts: true, sharedWithTitleDeed: pending.propertyPlanNumber },
            { session },
          );
          if (pending.agent) {
            console.log(`[SharedParts] Notifying agent: ${pending.agent}`);
            await notifySharedParts(pending.agent, newBuilding, pending, session);
          }
        }
      }
    } catch (linkErr) {
      console.warn(" [SharedParts] Linking logic mapping failed:", linkErr.message);
    }

    // 3️⃣ Process each apartment and its owners
    const createdApartments = [];
    const createdOwners = []; // Only for representative owners

    for (const aptObj of apartments) {
      const { apartment: aptDetails, owners: ownersList } = aptObj;

      if (
        !aptDetails ||
        !Array.isArray(ownersList) ||
        ownersList.length === 0
      ) {
        throw new Error(
          "Each apartment must have details and at least one owner",
        );
      }

      if (!aptDetails.main_plot_number || !aptDetails.main_plot_number.trim()) {
        throw new Error(
          "Each apartment must include 'main_plot_number' (canonical plot identifier)",
        );
      }

      if (
        aptDetails.division_number !== undefined &&
        aptDetails.division_number !== null
      ) {
        const dn = Number(aptDetails.division_number);
        if (!Number.isInteger(dn) || dn < 1) {
          throw new Error(
            "Each apartment.division_number must be an integer >= 1",
          );
        }
        aptDetails.division_number = dn;
      }

      if (
        aptDetails.land_share_area !== undefined &&
        aptDetails.land_share_area !== null
      ) {
        const la = Number(aptDetails.land_share_area);
        if (Number.isNaN(la) || la < 0) {
          throw new Error(
            "Each apartment.land_share_area must be a number >= 0",
          );
        }
        aptDetails.land_share_area = la;
      }

      // 3.1 Create Apartment (owners will be embedded objects)
      const apartmentData = {
        unit_code: aptDetails.apartment_number?.trim(),
        area_sqm: aptDetails.space ? parseFloat(aptDetails.space) : undefined,
        floor: aptDetails.floor ? parseInt(aptDetails.floor, 10) : undefined,
        usage_type: aptDetails.type?.trim() || "residential",
        registration_number: aptDetails.registration_number?.trim(),
        division_number: aptDetails.division_number
          ? parseInt(aptDetails.division_number, 10)
          : undefined,
        land_share_ratio: aptDetails.land_share_ratio?.trim() || undefined,
        unit_description: aptDetails.ownership_status?.trim(),
        main_plot_number: aptDetails.main_plot_number?.trim(),
        percentage_of_apartment: aptDetails.percentage_of_apartment
          ? parseFloat(aptDetails.percentage_of_apartment)
          : undefined,
        percentage_of_residence: aptDetails.percentage_of_residence
          ? parseFloat(aptDetails.percentage_of_residence)
          : undefined,
        building: newBuilding._id,
        agent: agent._id,
        owners: [], // ← will hold embedded owner objects (not User refs)
        ownerCredentials: [], // ← only rep login info (for agent)
      };

      const newApartment = new Apartment(apartmentData);
      await newApartment.save({ session });

      // 3.2 Process owners: only rep becomes a User
      let repIndex = -1;

      // Find representative
      for (let i = 0; i < ownersList.length; i++) {
        if (ownersList[i].isRepresentative) {
          repIndex = i;
          break;
        }
      }

      // Fallback: use first owner as rep if none marked
      if (repIndex === -1 && ownersList.length > 0) {
        repIndex = 0;
        ownersList[0] = { ...ownersList[0], isRepresentative: true };
      }

      // Embed all owners (including rep) as plain objects
      const embeddedOwners = ownersList.map((owner) => ({
        firstName: owner.firstName?.trim() || "",
        lastName: owner.lastName?.trim() || "",
        nationalId: owner.nationalId?.trim() || "",
        email: owner.email?.trim() || "",
        phone: owner.phone?.trim() || "",
        isRepresentative: !!owner.isRepresentative,
      }));

      // Create User only for the representative
      let representativeUser = null;
      if (repIndex !== -1) {
        const repOwner = ownersList[repIndex];
        const firstName = repOwner.firstName.trim();
        const lastName = repOwner.lastName.trim();
        const fullName = `${firstName} ${lastName}`;
        const nationalId = repOwner.nationalId.trim();

        // Generate special email
        const emailLocal =
          `${apartmentData.unit_code.toLowerCase()}.${newBuilding.building_name.toLowerCase()}.${firstName.toLowerCase()}`
            .replace(/\s+/g, "")
            .replace(/[^a-z0-9.\-@]/g, "");
        const repEmail = `${emailLocal}@owner.com`;

        // Ensure email uniqueness
        const existingUser = await User.findOne({ email: repEmail }).session(
          session,
        );
        if (existingUser) {
          throw new Error(`Representative email already exists: ${repEmail}`);
        }

        const hashedPassword = await bcrypt.hash(nationalId, 10);
        const newUser = new User({
          name: fullName,
          email: repEmail,
          password_hash: hashedPassword,
          nationalId: nationalId,
          role: "property_owner",
          status: "ACTIVE",
        });
        await newUser.save({ session });

        representativeUser = newUser;

        // Store credentials for retrieval
        newApartment.ownerCredentials.push({
          owner: representativeUser._id,
          email: repEmail,
          password: encryptCredential(nationalId), // AES-256 encrypted
        });

        createdOwners.push({
          name: fullName,
          email: repEmail,
          password: nationalId,
          isRepresentative: true,
        });

        // Update embedded owner email to the auto-generated one
        embeddedOwners[repIndex] = {
          ...embeddedOwners[repIndex],
          email: repEmail,
        };
      }

      // Save embedded owners
      newApartment.owners = embeddedOwners;

      // Link rep User if exists
      if (representativeUser) {
        newApartment.representativeUser = representativeUser._id;
      }

      await newApartment.save({ session });

      // 3.3 Link apartment to building
      newBuilding.apartments.push(newApartment._id);
      await newBuilding.save({ session });

      // 3.4 Link apartment to agent user
      if (!agent.apartments) agent.apartments = [];
      agent.apartments.push(newApartment._id);
      await agent.save({ session });

      // 3.5 Create/Find group and add representative
      const groupName = `${newBuilding.building_name} - Private Group`;
      let group = await Group.findOne({
        name: groupName,
        managers: req.user.id,
      }).session(session);
      if (!group) {
        group = new Group({
          name: groupName,
          description: `Private discussion group for residents of ${newBuilding.building_name}`,
          managers: [req.user.id],
          is_active: true,
        });
        await group.save({ session });
      }

      if (representativeUser) {
        representativeUser.groups = representativeUser.groups || [];
        representativeUser.groups.push(group._id);
        await representativeUser.save({ session });
      }

      createdApartments.push(newApartment);
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: `Building and ${createdApartments.length} apartments created successfully`,
      building: newBuilding,
      apartments: createdApartments,
      owners: createdOwners, // return representative owners' credentials
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error in createBuildingWithMultipleApartments:", error);
    res.status(500).json({
      error: error.message || "Failed to create building and apartments",
    });
  }
};

/**
 * DELETE /api/buildings/:buildingId
 * Delete building and all its apartments
 */
export const deleteBuilding = async (req, res) => {
  try {
    const { buildingId } = req.params;

    // Get the authenticated user (who should be a union agent)
    const agent = await User.findById(req.user.id);
    if (!agent || agent.role !== "union_agent")
      return res.status(404).json({ error: "Agent user not found" });

    const building = await Building.findById(buildingId);
    if (!building) {
      return res.status(404).json({ error: "Building not found" });
    }

    // Get all apartments in this building
    const apartments = await Apartment.find({ building: buildingId });
    const aptIds = apartments.map((a) => a._id);

    // 1. Find all users who own ANY of these apartments
    // (This ensures we catch everyone linked to this building)
    const usersInBuilding = await User.find({ apartments: { $in: aptIds } });

    // 2. Remove apartments
    await Apartment.deleteMany({ _id: { $in: aptIds } });

    // 3. Remove building
    await Building.findByIdAndDelete(buildingId);

    // 4. Update Owners (Orphan Check)
    let deletedUsersCount = 0;

    for (const user of usersInBuilding) {
      // Remove the deleted apartments from their list
      user.apartments = user.apartments.filter(
        (id) => !aptIds.some((aptId) => aptId.toString() === id.toString()),
      );
      await user.save();

      // Check if they are now an orphan
      if (user.apartments.length === 0 && user.role === "property_owner") {
        console.log(
          `User ${user._id} (${user.email}) is now an orphan after building delete. Deleting...`,
        );
        await User.findByIdAndDelete(user._id);
        deletedUsersCount++;
      }
    }

    // 5. Remove references from agent user
    if (agent.apartments) {
      agent.apartments = agent.apartments.filter(
        (aid) => !aptIds.some((x) => x.toString() === aid.toString()),
      );
      await agent.save();
    }

    res.json({
      success: true,
      deletedApartments: aptIds.length,
      deletedUsers: deletedUsersCount,
    });
  } catch (error) {
    console.error("Error deleting building:", error);
    res.status(500).json({ error: "Failed to delete building" });
  }
};

/**
 * POST /api/buildings/:buildingId/apartments-with-owners
 * Add a new apartment with owners to an EXISTING building
 */
export const addApartmentWithOwnersToBuilding = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { buildingId } = req.params;

    // 1️⃣ Get the authenticated union agent user
    const agent = await User.findById(req.user.id).session(session);
    if (!agent || agent.role !== "union_agent") {
      throw new Error("Agent user not found or invalid role");
    }

    const { apartment, owners } = req.body;

    if (!apartment || !Array.isArray(owners) || owners.length === 0) {
      throw new Error("Apartment details and at least one owner are required");
    }

    // 2️⃣ Find the existing building
    const building = await Building.findById(buildingId).session(session);
    if (!building) {
      throw new Error("Building not found");
    }

    // Enforce new plot identifier: require main_plot_number
    if (!apartment.main_plot_number || !apartment.main_plot_number.trim()) {
      throw new Error(
        "Apartment must include 'main_plot_number' (canonical plot identifier)",
      );
    }

    // Optional numeric fields from frontend
    if (
      apartment.division_number !== undefined &&
      apartment.division_number !== null
    ) {
      const dn = Number(apartment.division_number);
      if (!Number.isInteger(dn) || dn < 1)
        throw new Error("'division_number' must be an integer >= 1");
      apartment.division_number = dn;
    }

    if (
      apartment.land_share_area !== undefined &&
      apartment.land_share_area !== null
    ) {
      const la = Number(apartment.land_share_area);
      if (Number.isNaN(la) || la < 0)
        throw new Error("'land_share_area' must be a number >= 0");
      apartment.land_share_area = la;
    }

    // 3️⃣ Create apartment linked to this building
    const apartmentData = {
      unit_code: apartment.apartment_number?.trim(),
      unit_description: apartment.ownership_status?.trim(),
      registration_number: apartment.main_plot_number?.trim(),
      main_plot_number: apartment.main_plot_number?.trim(),
      // optional numeric division number
      division_number:
        apartment.division_number !== undefined
          ? apartment.division_number
          : undefined,

      area_sqm: apartment.space ? parseFloat(apartment.space) : undefined,
      floor: apartment.floor ? parseInt(apartment.floor, 10) : undefined,
      usage_type: apartment.type?.trim() || "residential",

      land_share_ratio: apartment.share_percentage
        ? `${apartment.share_percentage}%`
        : undefined,
      land_share_area:
        apartment.land_share_area !== undefined
          ? apartment.land_share_area
          : undefined,
      percentage_of_apartment: apartment.percentage_of_apartment
        ? parseFloat(apartment.percentage_of_apartment)
        : undefined,

      building: building._id,
      agent: agent._id,
      owners: [], // We will set this to embeddedOwners array
    };

    const newApartment = new Apartment(apartmentData);
    // Don't save yet, we need to populate owners

    // 4️⃣ Process owners
    const createdCredentials = [];
    let representativeUser = null;
    let repIndex = -1;

    // Identify representative
    for (let i = 0; i < owners.length; i++) {
      if (owners[i].isRepresentative) {
        repIndex = i;
        break;
      }
    }
    // Default to first if none marked
    if (repIndex === -1 && owners.length > 0) {
      repIndex = 0;
      owners[0].isRepresentative = true;
    }

    // Map to embedded structure
    const embeddedOwners = owners.map((owner) => ({
      firstName: owner.firstName?.trim() || "",
      lastName: owner.lastName?.trim() || "",
      nationalId: owner.nationalId?.trim() || "",
      email: owner.email?.trim() || "",
      phone: owner.phone?.trim() || "",
      isRepresentative: !!owner.isRepresentative,
    }));

    // Process Representative User Creation
    if (repIndex !== -1) {
      const repOwner = owners[repIndex];
      const firstName = repOwner.firstName.trim();
      const lastName = repOwner.lastName.trim();
      const fullName = `${firstName} ${lastName}`;
      const nationalId = repOwner.nationalId.trim();

      // Generate special email
      const emailLocal =
        `${apartmentData.unit_code.toLowerCase()}.${building.building_name.toLowerCase()}.${firstName.toLowerCase()}`
          .replace(/\s+/g, "")
          .replace(/[^a-z0-9.\-@]/g, "");
      const repEmail = `${emailLocal}@owner.com`;

      // Check uniqueness
      const existingUser = await User.findOne({ email: repEmail }).session(
        session,
      );
      if (existingUser) {
        throw new Error(`Representative email already exists: ${repEmail}`);
      }

      const hashedPassword = await bcrypt.hash(nationalId, 10);
      const newUser = new User({
        name: fullName,
        email: repEmail,
        password_hash: hashedPassword,
        nationalId: nationalId,
        role: "property_owner",
        status: "ACTIVE",
      });
      await newUser.save({ session });
      representativeUser = newUser;

      // Store credentials for retrieval
      newApartment.ownerCredentials.push({
        owner: representativeUser._id,
        email: repEmail,
        password: encryptCredential(nationalId), // AES-256 encrypted
      });

      // Update embedded email matched for Rep to be the generated system email
      embeddedOwners[repIndex].email = repEmail;

      // Save credentials to return to API caller (Agent)
      createdCredentials.push({
        name: fullName,
        email: repEmail,
        password: nationalId,
        isRepresentative: true,
      });
    }

    // Save embedded owners and rep reference
    newApartment.owners = embeddedOwners;
    if (representativeUser) {
      newApartment.representativeUser = representativeUser._id;
    }
    await newApartment.save({ session });

    // 5️⃣ Link apartment to building and agent
    building.apartments.push(newApartment._id);
    await building.save({ session });

    if (!agent.apartments) agent.apartments = [];
    agent.apartments.push(newApartment._id);
    await agent.save({ session });

    // 6️⃣ Add Representative to Group (if exists)
    const groupName = `${building.building_name} - Private Group`;
    const group = await Group.findOne({
      name: groupName,
      managers: req.user.id,
    }).session(session);

    if (group && representativeUser) {
      await User.findByIdAndUpdate(
        representativeUser._id,
        { $push: { groups: group._id } },
        { session },
      );
    } else if (!group) {
      console.warn(
        `Warning: Private group for building ${building.building_name} not found. Rep not added to group.`,
      );
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: "Apartment and owners added to building successfully",
      apartment: newApartment,
      owners: createdCredentials, // Return credentials for the rep
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error in addApartmentWithOwnersToBuilding:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to add apartment to building" });
  }
};

/**
 * PUT /api/buildings/:buildingId
 * Update building details
 */
export const updateBuilding = async (req, res) => {
  try {
    const { buildingId } = req.params;
    const updateData = req.body;

    // Find and update building. Ensure it belongs to the authenticated agent.
    const building = await Building.findOneAndUpdate(
      { _id: buildingId, agent: req.user.id },
      { $set: updateData },
      { new: true, runValidators: true },
    );

    if (!building) {
      return res.status(404).json({
        success: false,
        message: "Building not found or you are not authorized to edit it",
      });
    }

    res.status(200).json({
      success: true,
      message: "Building updated successfully",
      data: building,
    });
  } catch (error) {
    console.error("Error updating building:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update building",
      error: error.message,
    });
  }
};
