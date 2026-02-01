import Document from '../models/Document.js';
import User from '../models/User.js';

/**
 * Document Access Control Service
 * Manages permissions and access rights for documents
 */
class DocumentAccessControlService {
  /**
   * Check if user can access document
   * @param {string} documentId - Document ID
   * @param {string} userId - User ID
   * @param {string} userRole - User role
   * @returns {Promise<boolean>} Access granted or not
   */
  async canAccessDocument(documentId, userId, userRole) {
    try {
      const document = await Document.findById(documentId)
        .populate('apartment_id')
        .populate('allowed_users');

      if (!document) return false;

      // Check if document is archived
      if (document.is_archived) {
        return userRole === 'union_agent'; // Only agents can access archived docs
      }

      // Check access level
      switch (document.access_level) {
        case 'public':
          return true;

        case 'agent_only':
          return userRole === 'union_agent';

        case 'owner_only':
          return userRole === 'property_owner' || userRole === 'union_agent';

        case 'unit_specific':
          // Check if user owns/manages the specific apartment
          if (!document.apartment_id) return false;
          
          const user = await User.findById(userId);
          if (!user) return false;

          // Agent can access all unit documents
          if (userRole === 'union_agent') return true;

          // Check if user's apartment matches
          const userApartmentIds = user.apartments?.map(apt => apt.toString()) || [];
          return userApartmentIds.includes(document.apartment_id._id.toString());

        case 'restricted':
          // Only specific users or agent
          if (userRole === 'union_agent') return true;
          const allowedUserIds = document.allowed_users?.map(u => u._id.toString()) || [];
          return allowedUserIds.includes(userId.toString());

        default:
          return false;
      }
    } catch (error) {
      console.error('Error checking document access:', error);
      return false;
    }
  }

  /**
   * Check if user can modify document
   * @param {string} documentId - Document ID
   * @param {string} userId - User ID
   * @param {string} userRole - User role
   */
  async canModifyDocument(documentId, userId, userRole) {
    try {
      const document = await Document.findById(documentId);
      if (!document) return false;

      // Only union agents can modify documents
      if (userRole !== 'union_agent') return false;

      // Uploaded by this user
      if (document.uploaded_by.toString() === userId.toString()) return true;

      // Or has supervisor privileges
      return true;
    } catch (error) {
      console.error('Error checking modify permission:', error);
      return false;
    }
  }

  /**
   * Check if user can approve document
   * @param {string} documentId - Document ID
   * @param {string} userId - User ID
   * @param {string} userRole - User role
   */
  async canApproveDocument(documentId, userId, userRole) {
    try {
      const document = await Document.findById(documentId);
      if (!document) return false;

      // Only union agents can approve
      if (userRole !== 'union_agent') return false;

      // Cannot approve own uploads
      if (document.uploaded_by.toString() === userId.toString()) return false;

      // Document must be in pending_review status
      return document.workflow_status === 'pending_review';
    } catch (error) {
      console.error('Error checking approve permission:', error);
      return false;
    }
  }

  /**
   * Get accessible documents for user
   * @param {string} userId - User ID
   * @param {string} userRole - User role
   * @param {Object} filters - Additional filters
   */
  async getAccessibleDocuments(userId, userRole, filters = {}) {
    try {
      const user = await User.findById(userId);
      if (!user) return [];

      let query = { is_archived: false };

      // Apply category filter if provided
      if (filters.category) {
        query.category = filters.category;
      }

      // Apply access control
      if (userRole === 'union_agent') {
        // Agents can see all non-archived documents
        // No additional query needed
      } else if (userRole === 'property_owner') {
        // Owners can see public, owner_only, and their unit-specific docs
        const userApartmentIds = user.apartments || [];
        
        query.$or = [
          { access_level: 'public' },
          { access_level: 'owner_only' },
          { 
            access_level: 'unit_specific', 
            apartment_id: { $in: userApartmentIds } 
          },
          {
            access_level: 'restricted',
            allowed_users: userId
          }
        ];
      } else {
        // Other roles: public only
        query.access_level = 'public';
      }

      // Only published documents (unless agent)
      if (userRole !== 'union_agent') {
        query.workflow_status = 'published';
      }

      const documents = await Document.find(query)
        .populate('uploaded_by', 'name role')
        .populate('last_modified_by', 'name role')
        .populate('approved_by', 'name role')
        .populate('apartment_id', 'number building_id')
        .sort({ uploaded_at: -1 })
        .lean();

      return documents;
    } catch (error) {
      console.error('Error getting accessible documents:', error);
      return [];
    }
  }

  /**
   * Set document permissions
   * @param {string} documentId - Document ID
   * @param {Object} permissions - Permission settings
   */
  async setDocumentPermissions(documentId, permissions) {
    try {
      const { access_level, allowed_users, allowed_roles, apartment_id } = permissions;

      const updateData = {};

      if (access_level) {
        updateData.access_level = access_level;
      }

      if (allowed_users) {
        updateData.allowed_users = allowed_users;
      }

      if (allowed_roles) {
        updateData.allowed_roles = allowed_roles;
      }

      if (apartment_id) {
        updateData.apartment_id = apartment_id;
      }

      const document = await Document.findByIdAndUpdate(
        documentId,
        updateData,
        { new: true }
      );

      return {
        success: true,
        document
      };
    } catch (error) {
      console.error('Error setting document permissions:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if document is sensitive (triggers notifications)
   */
  isSensitiveDocument(category) {
    const sensitiveCategories = ['Legal', 'Contract', 'Financial'];
    return sensitiveCategories.includes(category);
  }

  /**
   * Get users who should be notified about document changes
   * @param {Object} document - Document object
   */
  async getUsersToNotify(document) {
    try {
      const usersToNotify = [];

      // If unit-specific, notify apartment owners
      if (document.apartment_id) {
        const owners = await User.find({
          apartments: document.apartment_id,
          role: 'property_owner'
        });
        usersToNotify.push(...owners);
      }

      // If restricted, notify allowed users
      if (document.access_level === 'restricted' && document.allowed_users) {
        const allowedUsers = await User.find({
          _id: { $in: document.allowed_users }
        });
        usersToNotify.push(...allowedUsers);
      }

      // If sensitive, notify all agents
      if (document.is_sensitive) {
        const agents = await User.find({ role: 'union_agent' });
        usersToNotify.push(...agents);
      }

      // Remove duplicates
      const uniqueUsers = Array.from(
        new Map(usersToNotify.map(user => [user._id.toString(), user])).values()
      );

      return uniqueUsers;
    } catch (error) {
      console.error('Error getting users to notify:', error);
      return [];
    }
  }
}

export default new DocumentAccessControlService();
