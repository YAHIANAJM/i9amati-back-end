import Residence from '../models/Residence.js';
import Apartment from '../models/Apartment.js';
import UnionAgent from '../models/UnionAgent.js';
import Alert from '../models/Alert.js';
import User from '../models/User.js';

// Return main dashboard metadata: user_role, residences (scoped), widgets_access
export const getDashboard = async (req, res) => {
  try {
    // req.user contains { id, role }
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(401).json({ error: 'Unauthenticated' });

    const role = user.role;
    let residences = [];

    if (role === 'supervisor') {
      // Admin: return placeholder
      return res.json({ user_role: 'supervisor', residences: [], widgets_access: [], status: 'admin_dashboard_coming_soon' });
    }

    if (role === 'union_agent') {
      const agent = await UnionAgent.findOne({ user: user._id }).lean();
      if (!agent) return res.status(404).json({ error: 'Agent not found' });

      // Try to find Residence docs linked to this agent (agent_id)
      residences = await Residence.find({ agent_id: agent._id }).lean();

      // If no Residence docs have agent_id, attempt to synthesize from apartments
      if (!residences || residences.length === 0) {
        const apartments = await Apartment.find({ agent: agent._id }).lean();
        // group by building_name or address
        const map = new Map();
        for (const a of apartments) {
          const key = a.residence_id || a.building_name || (a.address ? a.address : `unknown-${String(a._id)}`);
          if (!map.has(key)) {
            map.set(key, {
              id: key,
              name: a.building_name || a.name || `Residence ${key}`,
              address: a.address || null
            });
          }
        }
        residences = Array.from(map.values());
      }
    }

    if (role === 'property_owner') {
      // owner: only the residence for their apartment
      const apt = await Apartment.findById(user.apartment).lean();
      if (!apt) return res.status(404).json({ error: 'Apartment not found' });

      if (apt.residence_id) {
        const r = await Residence.findById(apt.residence_id).lean();
        if (r) residences = [r];
      }

      if (residences.length === 0) {
        // synthesize
        const id = apt.residence_id || apt.building_name || String(apt._id);
        residences = [{ id, name: apt.building_name || apt.name || 'My Residence', address: apt.address }];
      }
    }

    const widgets_access = role === 'supervisor' ? [] : ['finance', 'alerts', 'services'];

    return res.json({ user_role: role, residences, widgets_access });
  } catch (err) {
    console.error('getDashboard error:', err);
    return res.status(500).json({ error: 'Failed to load dashboard' });
  }
};

// Simple residence alerts endpoint
export const getResidenceAlerts = async (req, res) => {
  try {
    const residenceId = req.params.id;
    // Alerts are expected to have residence_id field
    const alerts = await Alert.find({ residence_id: residenceId }).sort({ created_at: -1 }).lean();
    res.json(alerts);
  } catch (err) {
    console.error('getResidenceAlerts error:', err);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
};

export default { getDashboard, getResidenceAlerts };
