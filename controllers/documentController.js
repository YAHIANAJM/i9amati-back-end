import Document from '../models/Document.js';
import DocumentVersion from '../models/DocumentVersion.js';
import Building from '../models/Building.js';
import Apartment from '../models/Apartment.js';
import User from '../models/User.js';
import documentAccessControl from '../services/documentAccessControl.js';
import documentWorkflowService from '../services/documentWorkflowService.js';
import documentVersioningService from '../services/documentVersioningService.js';

/**
 * Get dashboard statistics
 */
export const getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Get accessible documents based on role
    const accessibleDocs = await documentAccessControl.getAccessibleDocuments(
      userId,
      userRole
    );

    // Count by workflow status
    const stats = {
      total: accessibleDocs.length,
      draft: accessibleDocs.filter(d => d.workflow_status === 'draft').length,
      pending_review: accessibleDocs.filter(d => d.workflow_status === 'pending_review').length,
      approved: accessibleDocs.filter(d => d.workflow_status === 'approved').length,
      published: accessibleDocs.filter(d => d.workflow_status === 'published').length,
      rejected: accessibleDocs.filter(d => d.workflow_status === 'rejected').length,
      
      // By category
      by_category: {
        Legal: accessibleDocs.filter(d => d.category === 'Legal').length,
        Financial: accessibleDocs.filter(d => d.category === 'Financial').length,
        Meeting: accessibleDocs.filter(d => d.category === 'Meeting').length,
        Contract: accessibleDocs.filter(d => d.category === 'Contract').length,
        Other: accessibleDocs.filter(d => d.category === 'Other').length
      },

      // By access level
      by_access: {
        public: accessibleDocs.filter(d => d.access_level === 'public').length,
        owner_only: accessibleDocs.filter(d => d.access_level === 'owner_only').length,
        agent_only: accessibleDocs.filter(d => d.access_level === 'agent_only').length,
        unit_specific: accessibleDocs.filter(d => d.access_level === 'unit_specific').length,
        restricted: accessibleDocs.filter(d => d.access_level === 'restricted').length
      },

      // Sensitive documents count
      sensitive: accessibleDocs.filter(d => d.is_sensitive).length,

      // Recent uploads (last 30 days)
      recent_uploads: accessibleDocs.filter(d => {
        const uploadDate = new Date(d.uploaded_at);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return uploadDate >= thirtyDaysAgo;
      }).length
    };

    // For agents, include pending actions
    if (userRole === 'union_agent') {
      stats.pending_approvals = accessibleDocs.filter(
        d => d.workflow_status === 'pending_review'
      ).length;
    }

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Search documents
 */
export const searchDocuments = async (req, res) => {
  try {
    const { query, category, access_level, status, date_from, date_to } = req.query;

    const filters = {};
    
    if (category) filters.category = category;
    if (access_level) filters.access_level = access_level;
    if (status) filters.workflow_status = status;

    // Get accessible documents
    const accessibleDocs = await documentAccessControl.getAccessibleDocuments(
      req.user.id,
      req.user.role,
      filters
    );

    let results = accessibleDocs;

    // Apply text search if query provided
    if (query) {
      // Escape special regex characters to prevent ReDoS
      const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(safeQuery, 'i');
      results = results.filter(doc =>
        searchRegex.test(doc.title) ||
        searchRegex.test(doc.description) ||
        (doc.tags && doc.tags.some(tag => searchRegex.test(tag)))
      );
    }

    // Apply date filters
    if (date_from || date_to) {
      results = results.filter(doc => {
        const uploadDate = new Date(doc.uploaded_at);
        if (date_from && uploadDate < new Date(date_from)) return false;
        if (date_to && uploadDate > new Date(date_to)) return false;
        return true;
      });
    }

    res.json({
      success: true,
      count: results.length,
      documents: results
    });
  } catch (error) {
    console.error('Error searching documents:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get documents requiring review (for agents)
 */
export const getPendingReviews = async (req, res) => {
  try {
    if (req.user.role !== 'union_agent') {
      return res.status(403).json({ error: 'Only union agents can access pending reviews' });
    }

    const pendingDocs = await Document.find({
      workflow_status: 'pending_review'
    })
      .populate('uploaded_by', 'name email')
      .populate('apartment_id', 'number building_id')
      .sort({ submitted_at: -1 })
      .lean();

    res.json({
      success: true,
      count: pendingDocs.length,
      documents: pendingDocs
    });
  } catch (error) {
    console.error('Error getting pending reviews:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get document analytics
 */
export const getDocumentAnalytics = async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(period));

    // Get accessible documents
    const accessibleDocs = await documentAccessControl.getAccessibleDocuments(
      req.user.id,
      req.user.role
    );

    const recentDocs = accessibleDocs.filter(d => 
      new Date(d.uploaded_at) >= daysAgo
    );

    // Upload trends by day
    const uploadsByDay = {};
    recentDocs.forEach(doc => {
      const day = new Date(doc.uploaded_at).toISOString().split('T')[0];
      uploadsByDay[day] = (uploadsByDay[day] || 0) + 1;
    });

    // Top uploaders
    const uploaderCounts = {};
    accessibleDocs.forEach(doc => {
      if (doc.uploaded_by) {
        const uploaderId = doc.uploaded_by._id || doc.uploaded_by;
        uploaderCounts[uploaderId] = (uploaderCounts[uploaderId] || 0) + 1;
      }
    });

    // Most viewed categories
    const categoryViews = {};
    accessibleDocs.forEach(doc => {
      categoryViews[doc.category] = (categoryViews[doc.category] || 0) + (doc.download_count || 0);
    });

    // Version statistics
    const versionStats = await DocumentVersion.aggregate([
      {
        $group: {
          _id: '$document_id',
          versionCount: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: null,
          totalVersions: { $sum: '$versionCount' },
          avgVersionsPerDoc: { $avg: '$versionCount' },
          maxVersions: { $max: '$versionCount' }
        }
      }
    ]);

    res.json({
      success: true,
      period: `${period} days`,
      analytics: {
        uploads_by_day: uploadsByDay,
        top_uploaders: uploaderCounts,
        category_views: categoryViews,
        version_statistics: versionStats[0] || {
          totalVersions: 0,
          avgVersionsPerDoc: 0,
          maxVersions: 0
        },
        total_documents: accessibleDocs.length,
        recent_uploads: recentDocs.length
      }
    });
  } catch (error) {
    console.error('Error getting analytics:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Bulk update document metadata
 */
export const bulkUpdateDocuments = async (req, res) => {
  try {
    if (req.user.role !== 'union_agent') {
      return res.status(403).json({ error: 'Only union agents can bulk update' });
    }

    const { document_ids, updates } = req.body;

    if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
      return res.status(400).json({ error: 'document_ids array is required' });
    }

    const allowedUpdates = ['category', 'access_level', 'tags', 'is_sensitive'];
    const filteredUpdates = {};

    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    if (Object.keys(filteredUpdates).length === 0) {
      return res.status(400).json({ error: 'No valid update fields provided' });
    }

    filteredUpdates.last_modified_by = req.user.id;
    filteredUpdates.last_modified_at = new Date();

    const result = await Document.updateMany(
      { _id: { $in: document_ids } },
      { $set: filteredUpdates }
    );

    res.json({
      success: true,
      matched: result.matchedCount,
      modified: result.modifiedCount,
      message: `Updated ${result.modifiedCount} documents`
    });
  } catch (error) {
    console.error('Error bulk updating documents:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get documents by building
 */
export const getDocumentsByBuilding = async (req, res) => {
  try {
    const { building_id } = req.params;

    // Get all apartments in this building
    const apartments = await Apartment.find({ building_id });
    const apartmentIds = apartments.map(a => a._id);

    const filters = {
      $or: [
        { apartment_id: { $in: apartmentIds } },
        { access_level: 'public' }
      ]
    };

    const documents = await documentAccessControl.getAccessibleDocuments(
      req.user.id,
      req.user.role,
      filters
    );

    res.json({
      success: true,
      building_id,
      count: documents.length,
      documents
    });
  } catch (error) {
    console.error('Error getting building documents:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Compare two document versions
 */
export const compareVersions = async (req, res) => {
  try {
    const { document_id } = req.params;
    const { version1, version2 } = req.query;

    if (!version1 || !version2) {
      return res.status(400).json({ 
        error: 'Both version1 and version2 query parameters are required' 
      });
    }

    const result = await documentVersioningService.compareVersions(
      document_id,
      parseInt(version1),
      parseInt(version2)
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Error comparing versions:', error);
    res.status(500).json({ error: error.message });
  }
};

export default {
  getDashboardStats,
  searchDocuments,
  getPendingReviews,
  getDocumentAnalytics,
  bulkUpdateDocuments,
  getDocumentsByBuilding,
  compareVersions
};
