import Meeting from '../models/Meeting.js';
import Building from '../models/Building.js';
import Apartment from '../models/Apartment.js';

/**
 * Get voting results for a meeting based on Law 18.00
 */
export const getMeetings = async (req, res) => {
  try {
    let buildingIds = [];
    if (req.user.role === 'union_agent') {
      const buildings = await Building.find({ agent: req.user.id });
      buildingIds = buildings.map(b => b._id);
    } else {
      const apartments = await Apartment.find({ 
        $or: [
          { representativeUser: req.user.id },
          { 'owners.email': req.user.email } // Best effort fallback
        ]
      });
      buildingIds = apartments.map(a => a.building);
    }
    
    const meetings = await Meeting.find({ residence_id: { $in: buildingIds } }).sort({ date: -1 });
    res.json(meetings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createMeeting = async (req, res) => {
  try {
    const { title, date, time, location, agenda, agenda_file_url, agenda_file_name, article_type, meeting_number, building_id } = req.body;
    
    // Find the building managed by this agent
    let buildingQuery = { agent: req.user.id };
    if (building_id) {
      buildingQuery._id = building_id;
    }
    const building = await Building.findOne(buildingQuery);
    if (!building) {
      return res.status(404).json({ message: "Building not found or you do not have permission to manage it." });
    }

    // Combine date and time into scheduled_at
    const scheduled_at = date && time ? new Date(`${date}T${time}`) : new Date();

    const newMeeting = new Meeting({
      residence_id: building._id,
      title: title || "New Meeting",
      type: 'ORDINARY', // Default type
      article_type: Number(article_type) || 20,
      meeting_number: Number(meeting_number) || 1,
      agenda: agenda || "",
      agenda_file_url: agenda_file_url || null,
      agenda_file_name: agenda_file_name || null,
      scheduled_at,
      status: 'PLANNED', // Map 'scheduled' to 'PLANNED'
      votes: []
    });

    const savedMeeting = await newMeeting.save();
    res.status(201).json(savedMeeting);
  } catch (error) {
    console.error("Create meeting error:", error);
    res.status(400).json({ message: error.message });
  }
};

export const updateMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { title, date, time, location, agenda, agenda_file_url, agenda_file_name, article_type, meeting_number, status } = req.body;
    
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });

    // Combine date and time into scheduled_at if provided
    let scheduled_at = meeting.scheduled_at;
    if (date && time) {
      scheduled_at = new Date(`${date}T${time}`);
    }

    const updated = await Meeting.findByIdAndUpdate(meetingId, {
      title: title || meeting.title,
      location: location || meeting.location,
      agenda: agenda || meeting.agenda,
      agenda_file_url: agenda_file_url !== undefined ? agenda_file_url : meeting.agenda_file_url,
      agenda_file_name: agenda_file_name !== undefined ? agenda_file_name : meeting.agenda_file_name,
      article_type: Number(article_type) || meeting.article_type,
      meeting_number: Number(meeting_number) || meeting.meeting_number,
      status: status || meeting.status,
      scheduled_at
    }, { new: true });

    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    await Meeting.findByIdAndDelete(meetingId);
    res.json({ message: "Meeting deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getEligibleVoters = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });

    // Find all apartments in the same building as the meeting
    const apartments = await Apartment.find({ building: meeting.residence_id })
      .populate('representativeUser', 'name email');
    
    res.json(apartments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getMeetingResults = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = await Meeting.findById(meetingId).populate('votes.unit_id');
    
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    const totalApartments = await Apartment.countDocuments({ building: meeting.residence_id });
    const votes = meeting.votes;
    
    const presentVotes = votes.filter(v => v.is_present);
    const presentCount = presentVotes.length;
    
    // Quorum (Article 18)
    const attendanceRate = totalApartments > 0 ? (presentCount / totalApartments) : 0;
    let quorumMet = false;
    
    if (meeting.meeting_number === 1) {
      quorumMet = attendanceRate >= 0.5;
    } else {
      // 2nd meeting is valid with any number of attendees
      quorumMet = true;
    }

    // Share calculations
    let yes_sum = 0;
    let no_sum = 0;
    let abstain_sum = 0;

    presentVotes.forEach(v => {
      const shares = v.shares || v.unit_id?.percentage_of_apartment || 0;
      if (v.vote === 'YES') yes_sum += shares;
      if (v.vote === 'NO') no_sum += shares;
      if (v.vote === 'ABSTAIN') abstain_sum += shares;
    });

    const total_present_shares = yes_sum + no_sum + abstain_sum;
    
    // Decision Logic
    let decision = "PENDING";
    let statusMessage = "";

    if (total_present_shares === 0) {
      decision = "REJECTED";
      statusMessage = "No shares present for voting";
    } else {
      switch (meeting.article_type) {
        case 20: // Relative Majority
          if (yes_sum > no_sum) {
            decision = "PASSED";
            statusMessage = "القرار يمر ✔ (الأغلبية النسبية)";
          } else {
            decision = "REJECTED";
            statusMessage = "القرار مرفوض ✖";
          }
          break;
          
        case 21: // 3/4 of present shares
          if (total_present_shares > 0 && (yes_sum / total_present_shares) >= 0.75) {
            decision = "PASSED";
            statusMessage = "القرار يمر ✔ (وصل إلى 3/4)";
          } else {
            decision = "REJECTED";
            statusMessage = "لم يصل إلى 3/4 ✖";
          }
          break;
          
        case 22: // Unanimity
          if (yes_sum === total_present_shares && total_present_shares > 0) {
            decision = "PASSED";
            statusMessage = "إجماع ✔";
          } else {
            decision = "REJECTED";
            statusMessage = "ليس إجماع ✖";
          }
          break;
      }
    }

    res.json({
      totalOwners: totalApartments,
      presentOwners: presentCount,
      attendanceRate: (attendanceRate * 100).toFixed(2) + '%',
      quorumMet,
      totalPresentShares: total_present_shares.toFixed(2),
      results: {
        yes: { count: votes.filter(v => v.vote === 'YES').length, shares: yes_sum.toFixed(2), percentage: total_present_shares > 0 ? ((yes_sum / total_present_shares) * 100).toFixed(2) : 0 },
        no: { count: votes.filter(v => v.vote === 'NO').length, shares: no_sum.toFixed(2), percentage: total_present_shares > 0 ? ((no_sum / total_present_shares) * 100).toFixed(2) : 0 },
        abstain: { count: votes.filter(v => v.vote === 'ABSTAIN').length, shares: abstain_sum.toFixed(2), percentage: total_present_shares > 0 ? ((abstain_sum / total_present_shares) * 100).toFixed(2) : 0 }
      },
      decision,
      statusMessage
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Submit or update a vote
 */
export const submitVote = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { unit_id, vote, is_present, shares } = req.body;

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });

    let finalUnitId = unit_id;

    // If no unit_id provided, find the apartment for the logged-in owner
    if (!finalUnitId) {
      const apartment = await Apartment.findOne({ representativeUser: req.user.id });
      if (!apartment) {
        return res.status(404).json({ message: "لم يتم العثور على شقة مرتبطة بحسابك." });
      }
      finalUnitId = apartment._id.toString();
    }

    const apartment = await Apartment.findById(finalUnitId);
    if (!apartment) return res.status(404).json({ message: "Unit not found" });

    const existingVoteIndex = meeting.votes.findIndex(v => v.unit_id?.toString() === finalUnitId);
    
    // Safely get representative name
    const rep = apartment.owners?.find(o => o.isRepresentative);
    const ownerName = rep ? `${rep.firstName || ''} ${rep.lastName || ''}`.trim() : (req.user?.name || "Unknown");

    const voteData = {
      unit_id: finalUnitId,
      owner_name: ownerName,
      unit_code: apartment.unit_code || "N/A",
      vote,
      is_present: is_present !== undefined ? is_present : true,
      shares: shares !== undefined ? shares : (apartment.percentage_of_apartment || apartment.area_sqm || 0)
    };

    if (existingVoteIndex > -1) {
      meeting.votes[existingVoteIndex] = voteData;
    } else {
      meeting.votes.push(voteData);
    }

    await meeting.save();
    res.json({ success: true, message: "Vote recorded successfully" });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
