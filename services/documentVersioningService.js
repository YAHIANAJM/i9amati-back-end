import Document from '../models/Document.js';
import DocumentVersion from '../models/DocumentVersion.js';
import User from '../models/User.js';
import documentNotificationService from './documentNotificationService.js';
import fs from 'fs';
import path from 'path';

/**
 * Document Versioning Service
 * Manages document versions, history, and restoration
 */
class DocumentVersioningService {
  /**
   * Create new version of document
   * @param {string} documentId - Document ID
   * @param {Object} fileData - New file data
   * @param {string} userId - User making the change
   * @param {string} changeSummary - Description of changes
   */
  async createNewVersion(documentId, fileData, userId, changeSummary) {
    try {
      const document = await Document.findById(documentId);
      if (!document) {
        throw new Error('Document not found');
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Get current version number
      const currentVersion = document.version;
      const newVersionNumber = currentVersion + 1;

      // Mark previous versions as not current
      await DocumentVersion.updateMany(
        { document_id: documentId },
        { is_current: false }
      );

      // Create new version record
      const newVersion = new DocumentVersion({
        document_id: documentId,
        version_number: newVersionNumber,
        title: document.title,
        description: document.description,
        file_path: fileData.path,
        url: fileData.url || null,
        size_bytes: fileData.size,
        mime_type: fileData.mimetype,
        change_type: 'updated',
        change_summary: changeSummary || 'Document updated',
        created_by: userId,
        created_by_name: user.name,
        created_by_role: user.role,
        category: document.category,
        access_level: document.access_level,
        workflow_status: document.workflow_status,
        is_current: true
      });

      await newVersion.save();

      // Update document
      const oldFilePath = document.file_path;
      document.file_path = fileData.path;
      document.url = fileData.url || null;
      document.size_bytes = fileData.size;
      document.mime_type = fileData.mimetype;
      document.version = newVersionNumber;
      document.last_modified_at = new Date();
      document.last_modified_by = userId;

      await document.save();

      // Send notifications for sensitive documents
      if (document.is_sensitive) {
        await documentNotificationService.notifyDocumentModified(
          document,
          user.name,
          changeSummary || 'Document updated'
        );
      }

      return {
        success: true,
        document,
        version: newVersion,
        message: `New version ${newVersionNumber} created`,
        previous_file: oldFilePath
      };
    } catch (error) {
      console.error('Error creating new version:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get version history for document
   * @param {string} documentId - Document ID
   */
  async getVersionHistory(documentId) {
    try {
      const versions = await DocumentVersion.find({ document_id: documentId })
        .sort({ version_number: -1 })
        .populate('created_by', 'name email role')
        .lean();

      const document = await Document.findById(documentId).lean();

      return {
        success: true,
        document: {
          _id: document._id,
          title: document.title,
          current_version: document.version,
          total_versions: versions.length
        },
        versions,
        message: `Found ${versions.length} versions`
      };
    } catch (error) {
      console.error('Error getting version history:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get specific version
   * @param {string} documentId - Document ID
   * @param {number} versionNumber - Version number to retrieve
   */
  async getVersion(documentId, versionNumber) {
    try {
      const version = await DocumentVersion.findOne({
        document_id: documentId,
        version_number: versionNumber
      })
        .populate('created_by', 'name email role')
        .lean();

      if (!version) {
        throw new Error(`Version ${versionNumber} not found`);
      }

      return {
        success: true,
        version
      };
    } catch (error) {
      console.error('Error getting version:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Restore previous version
   * @param {string} documentId - Document ID
   * @param {number} versionNumber - Version number to restore
   * @param {string} userId - User performing restore
   */
  async restoreVersion(documentId, versionNumber, userId) {
    try {
      const document = await Document.findById(documentId);
      if (!document) {
        throw new Error('Document not found');
      }

      const versionToRestore = await DocumentVersion.findOne({
        document_id: documentId,
        version_number: versionNumber
      });

      if (!versionToRestore) {
        throw new Error(`Version ${versionNumber} not found`);
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Get current version number
      const currentVersion = document.version;
      const newVersionNumber = currentVersion + 1;

      // Mark all versions as not current
      await DocumentVersion.updateMany(
        { document_id: documentId },
        { is_current: false }
      );

      // Create new version from restored content
      const restoredVersion = new DocumentVersion({
        document_id: documentId,
        version_number: newVersionNumber,
        title: document.title,
        description: document.description,
        file_path: versionToRestore.file_path, // Use file from old version
        url: versionToRestore.url,
        size_bytes: versionToRestore.size_bytes,
        mime_type: versionToRestore.mime_type,
        change_type: 'restored',
        change_summary: `Restored from version ${versionNumber}`,
        created_by: userId,
        created_by_name: user.name,
        created_by_role: user.role,
        category: document.category,
        access_level: document.access_level,
        workflow_status: document.workflow_status,
        is_current: true,
        restored_from: versionToRestore._id
      });

      await restoredVersion.save();

      // Update document to restored version
      document.file_path = versionToRestore.file_path;
      document.url = versionToRestore.url;
      document.size_bytes = versionToRestore.size_bytes;
      document.mime_type = versionToRestore.mime_type;
      document.version = newVersionNumber;
      document.last_modified_at = new Date();
      document.last_modified_by = userId;

      await document.save();

      // Send notifications
      await documentNotificationService.notifyDocumentRestored(
        document,
        versionNumber,
        user.name
      );

      return {
        success: true,
        document,
        version: restoredVersion,
        message: `Document restored to version ${versionNumber}`,
        new_version: newVersionNumber
      };
    } catch (error) {
      console.error('Error restoring version:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Compare two versions
   * @param {string} documentId - Document ID
   * @param {number} version1 - First version number
   * @param {number} version2 - Second version number
   */
  async compareVersions(documentId, version1, version2) {
    try {
      const v1 = await DocumentVersion.findOne({
        document_id: documentId,
        version_number: version1
      }).populate('created_by', 'name role');

      const v2 = await DocumentVersion.findOne({
        document_id: documentId,
        version_number: version2
      }).populate('created_by', 'name role');

      if (!v1 || !v2) {
        throw new Error('One or both versions not found');
      }

      const comparison = {
        version1: {
          number: v1.version_number,
          size: v1.size_bytes,
          modified_by: v1.created_by.name,
          modified_at: v1.created_at,
          change_summary: v1.change_summary
        },
        version2: {
          number: v2.version_number,
          size: v2.size_bytes,
          modified_by: v2.created_by.name,
          modified_at: v2.created_at,
          change_summary: v2.change_summary
        },
        differences: {
          size_diff: v2.size_bytes - v1.size_bytes,
          time_diff_hours: Math.round((v2.created_at - v1.created_at) / (1000 * 60 * 60)),
          different_editor: v1.created_by._id.toString() !== v2.created_by._id.toString()
        }
      };

      return {
        success: true,
        comparison
      };
    } catch (error) {
      console.error('Error comparing versions:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Download specific version file
   * @param {string} documentId - Document ID
   * @param {number} versionNumber - Version number
   */
  async downloadVersion(documentId, versionNumber) {
    try {
      const version = await DocumentVersion.findOne({
        document_id: documentId,
        version_number: versionNumber
      });

      if (!version) {
        throw new Error(`Version ${versionNumber} not found`);
      }

      if (!fs.existsSync(version.file_path)) {
        throw new Error('File not found on server');
      }

      return {
        success: true,
        file_path: version.file_path,
        file_name: path.basename(version.file_path),
        mime_type: version.mime_type,
        size: version.size_bytes
      };
    } catch (error) {
      console.error('Error downloading version:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete old versions (cleanup/archiving)
   * Keeps the last N versions
   * @param {string} documentId - Document ID
   * @param {number} keepLast - Number of recent versions to keep (default: 10)
   */
  async cleanupOldVersions(documentId, keepLast = 10) {
    try {
      const versions = await DocumentVersion.find({ document_id: documentId })
        .sort({ version_number: -1 })
        .lean();

      if (versions.length <= keepLast) {
        return {
          success: true,
          message: 'No versions to cleanup',
          total_versions: versions.length
        };
      }

      const versionsToDelete = versions.slice(keepLast);
      const deletedFiles = [];

      for (const version of versionsToDelete) {
        // Delete file from filesystem
        if (fs.existsSync(version.file_path)) {
          fs.unlinkSync(version.file_path);
          deletedFiles.push(version.file_path);
        }

        // Delete version record
        await DocumentVersion.findByIdAndDelete(version._id);
      }

      return {
        success: true,
        message: `Cleaned up ${versionsToDelete.length} old versions`,
        deleted_count: versionsToDelete.length,
        kept_count: keepLast,
        deleted_files: deletedFiles
      };
    } catch (error) {
      console.error('Error cleaning up versions:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default new DocumentVersioningService();
