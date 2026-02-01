import Notification from '../models/Notification.js';
import documentAccessControl from './documentAccessControl.js';

/**
 * Document Notification Service
 * Sends notifications when documents are created, modified, or published
 */
class DocumentNotificationService {
  /**
   * Notify users about new document upload
   * @param {Object} document - Document object
   */
  async notifyDocumentUploaded(document) {
    try {
      const usersToNotify = await documentAccessControl.getUsersToNotify(document);

      const notifications = [];
      for (const user of usersToNotify) {
        const notification = new Notification({
          user: user._id,
          title: 'مستند جديد - New Document',
          message: `تم رفع مستند جديد: ${document.title} (${document.category})`,
          message_en: `New document uploaded: ${document.title} (${document.category})`,
          type: 'document',
          reference_id: document._id,
          reference_type: 'Document',
          priority: document.is_sensitive ? 'high' : 'normal',
          status: 'unread'
        });

        await notification.save();
        notifications.push(notification);
      }

      return {
        success: true,
        notifications_sent: notifications.length,
        message: `${notifications.length} notifications sent`
      };
    } catch (error) {
      console.error('Error notifying document uploaded:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Notify users about document modification
   * @param {Object} document - Document object
   * @param {string} modifierName - Name of person who modified
   * @param {string} changeSummary - What changed
   */
  async notifyDocumentModified(document, modifierName, changeSummary) {
    try {
      const usersToNotify = await documentAccessControl.getUsersToNotify(document);

      const notifications = [];
      for (const user of usersToNotify) {
        const notification = new Notification({
          user: user._id,
          title: 'تحديث مستند - Document Updated',
          message: `تم تعديل المستند: ${document.title}\nبواسطة: ${modifierName}\nالتغييرات: ${changeSummary}`,
          message_en: `Document updated: ${document.title}\nBy: ${modifierName}\nChanges: ${changeSummary}`,
          type: 'document',
          reference_id: document._id,
          reference_type: 'Document',
          priority: document.is_sensitive ? 'high' : 'normal',
          status: 'unread',
          metadata: {
            document_title: document.title,
            category: document.category,
            modifier: modifierName,
            change_summary: changeSummary
          }
        });

        await notification.save();
        notifications.push(notification);
      }

      // If sensitive document, also notify all agents
      if (document.is_sensitive) {
        const User = (await import('../models/User.js')).default;
        const agents = await User.find({ role: 'union_agent' });

        for (const agent of agents) {
          // Skip if already notified
          if (usersToNotify.some(u => u._id.toString() === agent._id.toString())) {
            continue;
          }

          const notification = new Notification({
            user: agent._id,
            title: '⚠️ مستند حساس محدث - Sensitive Document Updated',
            message: `تم تحديث مستند حساس: ${document.title} (${document.category})`,
            message_en: `Sensitive document updated: ${document.title} (${document.category})`,
            type: 'alert',
            reference_id: document._id,
            reference_type: 'Document',
            priority: 'high',
            status: 'unread',
            metadata: {
              is_sensitive: true,
              category: document.category
            }
          });

          await notification.save();
          notifications.push(notification);
        }
      }

      return {
        success: true,
        notifications_sent: notifications.length
      };
    } catch (error) {
      console.error('Error notifying document modified:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Notify about document approval
   * @param {Object} document - Document object
   * @param {string} approverName - Name of approver
   */
  async notifyDocumentApproved(document, approverName) {
    try {
      const User = (await import('../models/User.js')).default;
      const uploader = await User.findById(document.uploaded_by);

      if (!uploader) return { success: false, error: 'Uploader not found' };

      const notification = new Notification({
        user: uploader._id,
        title: '✅ تمت الموافقة - Document Approved',
        message: `تمت الموافقة على المستند: ${document.title}\nبواسطة: ${approverName}`,
        message_en: `Document approved: ${document.title}\nBy: ${approverName}`,
        type: 'success',
        reference_id: document._id,
        reference_type: 'Document',
        priority: 'normal',
        status: 'unread',
        metadata: {
          approver: approverName,
          signature: document.signature
        }
      });

      await notification.save();

      return {
        success: true,
        notifications_sent: 1
      };
    } catch (error) {
      console.error('Error notifying document approved:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Notify about document rejection
   * @param {Object} document - Document object
   * @param {string} reviewerName - Name of reviewer
   * @param {string} reason - Rejection reason
   */
  async notifyDocumentRejected(document, reviewerName, reason) {
    try {
      const User = (await import('../models/User.js')).default;
      const uploader = await User.findById(document.uploaded_by);

      if (!uploader) return { success: false, error: 'Uploader not found' };

      const notification = new Notification({
        user: uploader._id,
        title: '❌ مستند مرفوض - Document Rejected',
        message: `تم رفض المستند: ${document.title}\nبواسطة: ${reviewerName}\nالسبب: ${reason}`,
        message_en: `Document rejected: ${document.title}\nBy: ${reviewerName}\nReason: ${reason}`,
        type: 'warning',
        reference_id: document._id,
        reference_type: 'Document',
        priority: 'high',
        status: 'unread',
        metadata: {
          reviewer: reviewerName,
          reason
        }
      });

      await notification.save();

      return {
        success: true,
        notifications_sent: 1
      };
    } catch (error) {
      console.error('Error notifying document rejected:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Notify about document publication
   * @param {Object} document - Document object
   */
  async notifyDocumentPublished(document) {
    try {
      const usersToNotify = await documentAccessControl.getUsersToNotify(document);

      const notifications = [];
      for (const user of usersToNotify) {
        const notification = new Notification({
          user: user._id,
          title: '📢 مستند منشور - Document Published',
          message: `تم نشر مستند جديد: ${document.title} (${document.category})`,
          message_en: `New document published: ${document.title} (${document.category})`,
          type: 'info',
          reference_id: document._id,
          reference_type: 'Document',
          priority: document.is_sensitive ? 'high' : 'normal',
          status: 'unread',
          metadata: {
            category: document.category,
            is_sensitive: document.is_sensitive
          }
        });

        await notification.save();
        notifications.push(notification);
      }

      return {
        success: true,
        notifications_sent: notifications.length
      };
    } catch (error) {
      console.error('Error notifying document published:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Notify about document version restore
   * @param {Object} document - Document object
   * @param {number} versionNumber - Version number restored
   * @param {string} restorerName - Name of person who restored
   */
  async notifyDocumentRestored(document, versionNumber, restorerName) {
    try {
      const usersToNotify = await documentAccessControl.getUsersToNotify(document);

      const notifications = [];
      for (const user of usersToNotify) {
        const notification = new Notification({
          user: user._id,
          title: '🔄 استرجاع نسخة - Version Restored',
          message: `تم استرجاع نسخة سابقة من: ${document.title}\nالنسخة: ${versionNumber}\nبواسطة: ${restorerName}`,
          message_en: `Previous version restored: ${document.title}\nVersion: ${versionNumber}\nBy: ${restorerName}`,
          type: 'info',
          reference_id: document._id,
          reference_type: 'Document',
          priority: 'high',
          status: 'unread',
          metadata: {
            version_number: versionNumber,
            restorer: restorerName
          }
        });

        await notification.save();
        notifications.push(notification);
      }

      return {
        success: true,
        notifications_sent: notifications.length
      };
    } catch (error) {
      console.error('Error notifying document restored:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default new DocumentNotificationService();
