// ========================================
// FILE 2: backend/controllers/apartmentController.js
// ========================================
import Building from "../models/Building.js";
import Apartment from "../models/Apartment.js";
import User from "../models/User.js";
import ExcelJS from "exceljs";

/**
 * GET /api/apartments/apartments-inbuilding/:buildingId
 * Get all apartments for a specific building
 */
export const getApartmentsByBuilding = async (req, res) => {
  try {
    const { buildingId } = req.params;

    // Verify building exists
    const building = await Building.findById(buildingId)
      .select("building_name building_code")
      .lean();
    if (!building) {
      return res.status(404).json({
        success: false,
        message: "Building not found",
      });
    }

    // Get all apartments for this building
    const apartments = await Apartment.find({ building: buildingId })
      .select(
        "unit_code floor area_sqm unit_description registration_number final_registration_number original_registration_number main_plot_number division_number land_share_ratio percentage_of_apartment usage_type building createdAt updatedAt",
      )
      .populate("building", "building_name building_code")
      .sort({ unit_code: 1 })
      .lean();

    res.status(200).json({
      success: true,
      buildingName: building.building_name,
      totalApartments: apartments.length,
      apartments,
    });
  } catch (error) {
    console.error("Error fetching apartments:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve apartments",
      error: error.message,
    });
  }
};

/**
 * GET /api/apartments/:id
 * Get single apartment by ID
 */
export const getApartmentById = async (req, res) => {
  try {
    const { id } = req.params;

    const apartment = await Apartment.findById(id)
      .populate("building", "building_name building_code building_address")
      .populate("agent", "name email")
      .lean();

    if (!apartment) {
      return res.status(404).json({
        success: false,
        message: "Apartment not found",
      });
    }

    res.status(200).json({
      success: true,
      apartment,
    });
  } catch (error) {
    console.error("Error fetching apartment details:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve apartment details",
      error: error.message,
    });
  }
};

/**
 * POST /api/apartments/createApartmentForBuilding
 * Add apartment to existing building
 */
export const createApartmentForBuilding = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { apartment, buildingId } = req.body;

    if (!apartment || !buildingId) {
      return res
        .status(400)
        .json({ error: "Apartment data and buildingId are required" });
    }

    // Require canonical main_plot_number instead of legacy number/plot_number
    if (!apartment.main_plot_number || !apartment.main_plot_number.trim()) {
      return res.status(400).json({
        error:
          "Apartment must include 'main_plot_number' (canonical plot identifier)",
      });
    }

    // Verify building exists
    const building = await Building.findById(buildingId).session(session);
    if (!building) {
      return res.status(404).json({ error: "Building not found" });
    }

    // Get the authenticated agent
    const agent = await User.findById(req.user.id).session(session);
    if (!agent || agent.role !== "union_agent") {
      return res.status(404).json({ error: "Agent user not found" });
    }
    // Validate optional incoming fields
    if (
      apartment.division_number !== undefined &&
      apartment.division_number !== null
    ) {
      const dn = Number(apartment.division_number);
      if (!Number.isInteger(dn) || dn < 1) {
        return res
          .status(400)
          .json({ error: "'division_number' must be an integer >= 1" });
      }
      apartment.division_number = dn;
    }

    if (
      apartment.land_share_area !== undefined &&
      apartment.land_share_area !== null
    ) {
      const la = Number(apartment.land_share_area);
      if (Number.isNaN(la) || la < 0) {
        return res
          .status(400)
          .json({ error: "'land_share_area' must be a number >= 0" });
      }
      apartment.land_share_area = la;
    }

    // Create apartment with correct field mapping
    const apartmentData = {
      unit_code: apartment.apartment_number?.trim(),
      unit_description:
        apartment.unit_description?.trim() ||
        apartment.ownership_status?.trim(),
      main_plot_number: apartment.main_plot_number?.trim(),
      registration_number: apartment.registration_number?.trim(),
      // optional numeric division number (prefer explicit field)
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
      // optional numeric land share area
      land_share_area:
        apartment.land_share_area !== undefined
          ? apartment.land_share_area
          : undefined,

      building: building._id,
      agent: agent._id,
      owners: [], // Empty initially
      ownerCredentials: [], // Empty initially
    };

    const newApartment = new Apartment(apartmentData);
    await newApartment.save({ session });

    // Link apartment to building
    building.apartments.push(newApartment._id);
    await building.save({ session });

    // Link apartment to agent
    if (!agent.apartments) agent.apartments = [];
    agent.apartments.push(newApartment._id);
    await agent.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: "Apartment created successfully",
      apartment: newApartment,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating apartment:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to create apartment" });
  }
};

/**
 * DELETE /api/apartments/:apartmentId
 * Delete apartment
 */
export const deleteApartment = async (req, res) => {
  try {
    const { apartmentId } = req.params;

    // Get the authenticated agent
    const agent = await User.findById(req.user.id);
    if (!agent || agent.role !== "union_agent")
      return res.status(404).json({ error: "Agent user not found" });

    console.log(
      "Attempting to delete apartment:",
      apartmentId,
      "for agent:",
      agent._id,
    );

    // Find apartment by ID and ensure it belongs to this agent
    const apt = await Apartment.findOneAndDelete({
      _id: apartmentId,
      agent: agent._id,
    });

    if (!apt) return res.status(404).json({ error: "Apartment not found" });

    // Remove from building
    if (apt.building) {
      await Building.findByIdAndUpdate(apt.building, {
        $pull: { apartments: apartmentId },
      });
    }

    // Remove from agent's apartments array
    await User.findByIdAndUpdate(agent._id, {
      $pull: { apartments: apartmentId },
    });

    // Handle owners (Orphan Check)
    const ownerIds = apt.owners || []; // These are embedded objects? No, schema says embedded objects but they might be ref'd in User model
    // Wait, Apartment schema has `owners` as embedded objects, but also `representativeUser` as ID.
    // However, create logic pushes User IDs to `newApartment.owners`?
    // Let's check schema again. Apartment.js: owners: [{...}] (embedded).
    // BUT in createBuildingWithApartmentAndOwners: newApartment.owners.push(newUser._id);
    // There is a mismatch. The schema defines `owners` as array of objects, but the controller pushes ObjectIds.
    // Mongoose might cast ObjectId to string if the schema is mixed, or fail.
    // Let's rely on finding Users who have this apartment in their `apartments` list.

    // Better approach: Find all users who have this apartment in their list
    const usersWithThisApt = await User.find({ apartments: apartmentId });

    for (const user of usersWithThisApt) {
      // 1. Remove the apartment from their list
      user.apartments = user.apartments.filter(
        (id) => id.toString() !== apartmentId.toString(),
      );
      await user.save();

      // 2. Check if they are now an orphan (no apartments left) AND are a property owner
      if (user.apartments.length === 0 && user.role === "property_owner") {
        console.log(
          `User ${user._id} (${user.email}) is now an orphan. Deleting...`,
        );
        await User.findByIdAndDelete(user._id);
      }
    }

    res.json({ success: true, message: "Apartment deleted successfully" });
  } catch (error) {
    console.error("Error deleting apartment:", error);
    res.status(500).json({ error: "Failed to delete apartment" });
  }
};

/**
 * GET /api/apartments
 * List all apartments for current union agent
 */
export const listApartments = async (req, res) => {
  try {
    // Find the user with role 'union_agent' based on the authenticated user ID
    const agent = await User.findById(req.user.id);
    if (!agent || agent.role !== "union_agent")
      return res.status(404).json({ error: "Agent not found" });

    // Find apartments where the agent field matches the agent's ID
    const apartments = await Apartment.find({ agent: agent._id })
      .populate("owners", "name email nationalId status") // Use 'name' from User schema
      .populate("representativeUser", "name email") // Populate representative user
      .populate("building", "building_name"); // Optionally populate building name

    res.json(apartments);
  } catch (error) {
    console.error("Error listing apartments:", error);
    res.status(500).json({ error: "Failed to list apartments" });
  }
};

/**
 * GET /api/apartments/export/building/:buildingId
 * Export all apartments for a specific building as Excel
 */
export const exportBuildingApartmentsExcel = async (req, res) => {
  try {
    const { buildingId } = req.params;

    const agent = await User.findById(req.user.id);
    if (!agent || agent.role !== "union_agent")
      return res.status(403).json({ error: "Access denied" });

    const building = await Building.findOne({ _id: buildingId, agent: agent._id }).lean();
    if (!building) return res.status(404).json({ error: "Building not found" });

    const apartments = await Apartment.find({ building: buildingId })
      .sort({ unit_code: 1 })
      .lean();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "i9amati";
    const ws = workbook.addWorksheet("Apartments");

    const BLUE = "FF4472C4";
    const GREEN = "FF70AD47";
    const WHITE = "FFFFFFFF";

    const colCount = 10;
    ws.mergeCells(`A1:J1`);
    const titleCell = ws.getCell("A1");
    titleCell.value = `Apartments — ${building.building_name}`;
    titleCell.font = { bold: true, size: 14, color: { argb: WHITE } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 28;

    ws.addRow([]);

    const headers = [
      "Unit Code", "Floor", "Area (m²)", "Usage Type",
      "Main Plot Number", "Registration Number", "Division Number",
      "Land Share Ratio", "% of Apartment", "Description",
    ];
    const headerRow = ws.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
      cell.font = { bold: true, color: { argb: WHITE } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = { bottom: { style: "thin" } };
    });
    headerRow.height = 20;

    apartments.forEach((apt) => {
      const row = ws.addRow([
        apt.unit_code || "",
        apt.floor ?? "",
        apt.area_sqm ?? "",
        apt.usage_type || "",
        apt.main_plot_number || "",
        apt.registration_number || "",
        apt.division_number ?? "",
        apt.land_share_ratio || "",
        apt.percentage_of_apartment ?? "",
        apt.unit_description || "",
      ]);
      row.getCell(3).numFmt = "#,##0.00";
    });

    [14, 8, 12, 16, 22, 22, 16, 18, 20, 28].forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });

    ws.addRow([]);
    const summaryRow = ws.addRow([`Total Apartments: ${apartments.length}`]);
    summaryRow.getCell(1).font = { bold: true };

    const safeName = building.building_name.replace(/[^a-zA-Z0-9؀-ۿ_\- ]/g, "");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="apartments-${safeName}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting building apartments:", error);
    res.status(500).json({ error: "Failed to export apartments" });
  }
};

/**
 * GET /api/apartments/export/all
 * Export all buildings + apartments grouped by type (individual vs إقامة)
 */
export const exportAllApartmentsExcel = async (req, res) => {
  try {
    const agent = await User.findById(req.user.id);
    if (!agent || agent.role !== "union_agent")
      return res.status(403).json({ error: "Access denied" });

    const buildings = await Building.find({ agent: agent._id }).lean();

    const BLUE = "FF4472C4";
    const TEAL = "FF00897B";
    const GREEN = "FF70AD47";
    const WHITE = "FFFFFFFF";

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "i9amati";

    const HEADERS = [
      "Building", "Type", "Unit Code", "Floor", "Area (m²)", "Usage Type",
      "Main Plot Number", "Registration Number", "Division Number",
      "Land Share Ratio", "% of Apartment",
    ];
    const COL_WIDTHS = [28, 16, 14, 8, 12, 16, 22, 22, 16, 18, 20];

    const buildSheet = (ws, headerColor, sheetTitle) => {
      ws.mergeCells("A1:K1");
      const titleCell = ws.getCell("A1");
      titleCell.value = sheetTitle;
      titleCell.font = { bold: true, size: 14, color: { argb: WHITE } };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerColor } };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(1).height = 28;

      ws.addRow([]);

      const headerRow = ws.addRow(HEADERS);
      headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
        cell.font = { bold: true, color: { argb: WHITE } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = { bottom: { style: "thin" } };
      });
      headerRow.height = 20;
      COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    };

    const addBuildingRows = (ws, building, typeLabel, apartments) => {
      if (apartments.length === 0) {
        ws.addRow([building.building_name, typeLabel, "", "", "", "", "", "", "", "", ""]);
        return;
      }
      apartments.forEach((apt) => {
        const row = ws.addRow([
          building.building_name,
          typeLabel,
          apt.unit_code || "",
          apt.floor ?? "",
          apt.area_sqm ?? "",
          apt.usage_type || "",
          apt.main_plot_number || "",
          apt.registration_number || "",
          apt.division_number ?? "",
          apt.land_share_ratio || "",
          apt.percentage_of_apartment ?? "",
        ]);
        row.getCell(5).numFmt = "#,##0.00";
      });
    };

    const immeubleBuildings = buildings.filter((b) => b.union_type !== "residence");
    const residenceBuildings = buildings.filter((b) => b.union_type === "residence");

    if (immeubleBuildings.length > 0) {
      const ws = workbook.addWorksheet("عمارة - Individual");
      buildSheet(ws, BLUE, "Individual Buildings — عمارة");
      let total = 0;
      for (const b of immeubleBuildings) {
        const apts = await Apartment.find({ building: b._id }).sort({ unit_code: 1 }).lean();
        addBuildingRows(ws, b, "Individual", apts);
        total += apts.length;
      }
      ws.addRow([]);
      const sr = ws.addRow([`Total: ${immeubleBuildings.length} buildings, ${total} apartments`]);
      sr.getCell(1).font = { bold: true };
    }

    if (residenceBuildings.length > 0) {
      const ws = workbook.addWorksheet("إقامة - Residence");
      buildSheet(ws, TEAL, "Residence Buildings — إقامة");
      let total = 0;
      for (const b of residenceBuildings) {
        const apts = await Apartment.find({ building: b._id }).sort({ unit_code: 1 }).lean();
        addBuildingRows(ws, b, "Residence (إقامة)", apts);
        total += apts.length;
      }
      ws.addRow([]);
      const sr = ws.addRow([`Total: ${residenceBuildings.length} buildings, ${total} apartments`]);
      sr.getCell(1).font = { bold: true };
    }

    if (buildings.length === 0) {
      workbook.addWorksheet("No Data").addRow(["No buildings found"]);
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="all-apartments-${Date.now()}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting all apartments:", error);
    res.status(500).json({ error: "Failed to export apartments" });
  }
};

/**
 * PUT /api/apartments/:apartmentId
 * Edit apartment details
 */
export const editApartment = async (req, res) => {
  try {
    const { apartmentId } = req.params;
    const { apartment } = req.body;

    console.log("--- DEBUG: editApartment ---");
    console.log("Apartment ID:", apartmentId);
    console.log("User ID (Agent):", req.user.id);
    console.log("Incoming apartment data:", JSON.stringify(apartment, null, 2));

    if (!apartment) {
      return res.status(400).json({ error: "Apartment data is required" });
    }

    // Map frontend fields (from ManageApartments.jsx modal state) to backend schema fields
    const updateData = {};

    // Handle specific field mappings based on what the frontend sends
    if (
      apartment.apartment_number !== undefined &&
      apartment.apartment_number !== ""
    ) {
      updateData.unit_code = apartment.apartment_number;
    } else if (apartment.code !== undefined && apartment.code !== "") {
      updateData.unit_code = apartment.code;
    }

    if (apartment.ownership_status !== undefined)
      updateData.unit_description = apartment.ownership_status;
    if (apartment.registration_number !== undefined)
      updateData.registration_number = apartment.registration_number;

    // REQUIRED FIELD: Only update if NOT an empty string to avoid validation error
    if (
      apartment.main_plot_number !== undefined &&
      apartment.main_plot_number !== ""
    ) {
      updateData.main_plot_number = apartment.main_plot_number;
    }

    if (apartment.division_number !== undefined)
      updateData.division_number = apartment.division_number;
    if (apartment.space !== undefined) updateData.area_sqm = apartment.space;
    if (apartment.floor !== undefined) updateData.floor = apartment.floor;
    if (apartment.type !== undefined) updateData.usage_type = apartment.type;
    if (apartment.land_share_ratio !== undefined)
      updateData.land_share_ratio = apartment.land_share_ratio;
    if (apartment.percentage_of_apartment !== undefined)
      updateData.percentage_of_apartment = apartment.percentage_of_apartment;

    console.log(
      "Final updateData (PATCH):",
      JSON.stringify(updateData, null, 2),
    );

    if (Object.keys(updateData).length === 0) {
      return res.json({
        success: true,
        message: "No changes detected",
        apartment: await Apartment.findById(apartmentId),
      });
    }

    // Find apartment where agent matches the authenticated user
    const apt = await Apartment.findOneAndUpdate(
      { _id: apartmentId, agent: req.user.id },
      { $set: updateData },
      { new: true, runValidators: true },
    );

    if (!apt) {
      console.log("Update failed: Apartment not found or agent mismatch");
      return res.status(404).json({ error: "Apartment not found" });
    }

    console.log("Update success! Updated doc:", JSON.stringify(apt, null, 2));

    res.json({ success: true, apartment: apt });
  } catch (error) {
    console.error("Error editing apartment:", error);
    res.status(500).json({ error: "Failed to edit apartment" });
  }
};
