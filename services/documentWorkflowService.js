import Document from "../models/Document.js";
import DocumentVersion from "../models/DocumentVersion.js";
import User from "../models/User.js";
import crypto from "crypto";
import fs from "fs";
import path from "path";

/**
 * Document Workflow Service
 * Manages document approval workflow: upload → review → publish
 */
class DocumentWorkflowService {
  /**
   * Upload new document (creates draft)
   * @param {Object} fileData - Uploaded file information
   * @param {Object} metadata - Document metadata
   * @param {string} userId - Uploader user ID
   */
  async uploadDocument(fileData, metadata, userId) {
    try {
      const {
        title,
        description,
        category,
        access_level = "owner_only",
        apartment_id,
        is_sensitive = false,
        tags = [],
        allowed_users = [],
      } = metadata;

      console.log(
        `[Workflow] 💾 Saving document. Allowed Users: ${allowed_users.length}`,
      );

      const user = await User.findById(userId);

      if (!user) {
        throw new Error("User not found");
      }

      // Create document with draft status
      const document = new Document({
        title,
        description,
        category,
        type: path.extname(fileData.originalname).substring(1).toUpperCase(),
        file_path: fileData.path,
        url: fileData.cloudinaryUrl || fileData.url || null,
        resource_type: fileData.resourceType,
        size_bytes: fileData.size,
        mime_type: fileData.mimetype,
        access_level,
        apartment_id,
        allowed_users,
        is_sensitive,
        tags,

        workflow_status: "draft",
        uploaded_by: userId,
        uploaded_at: new Date(),
        version: 1,
        is_latest: true,
      });

      await document.save();

      // Create initial version
      const version = new DocumentVersion({
        document_id: document._id,
        version_number: 1,
        title,
        description,
        file_path: fileData.path,
        url: fileData.cloudinaryUrl || fileData.url,
        size_bytes: fileData.size,
        mime_type: fileData.mimetype,
        change_type: "created",
        change_summary: "Initial upload",
        created_by: userId,
        created_by_name: user.name,
        created_by_role: user.role,
        category,
        access_level,
        workflow_status: "draft",
        is_current: true,
      });

      await version.save();

      return {
        success: true,
        document,
        version,
        message: "Document uploaded successfully. Status: Draft",
      };
    } catch (error) {
      console.error("Error uploading document:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Submit document for review
   * @param {string} documentId - Document ID
   * @param {string} userId - User ID submitting
   */
  async submitForReview(documentId, userId) {
    try {
      const document = await Document.findById(documentId);
      if (!document) {
        throw new Error("Document not found");
      }

      // Check if user is the uploader
      if (document.uploaded_by.toString() !== userId.toString()) {
        throw new Error("Only document uploader can submit for review");
      }

      // Check current status
      if (document.workflow_status !== "draft") {
        throw new Error(
          `Cannot submit document with status: ${document.workflow_status}`,
        );
      }

      // Update status
      document.workflow_status = "pending_review";
      document.last_modified_at = new Date();
      document.last_modified_by = userId;
      await document.save();

      return {
        success: true,
        document,
        message: "Document submitted for review",
      };
    } catch (error) {
      console.error("Error submitting for review:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Approve document (requires supervisor)
   * @param {string} documentId - Document ID
   * @param {string} userId - Supervisor user ID
   * @param {Object} approvalData - Approval information
   */
  async approveDocument(documentId, userId, approvalData = {}) {
    try {
      const { signature, comments } = approvalData;

      const document = await Document.findById(documentId);
      if (!document) {
        throw new Error("Document not found");
      }

      const user = await User.findById(userId);
      if (!user || user.role !== "union_agent") {
        throw new Error("Only union agents can approve documents");
      }

      // TODO: Re-enable in production - Cannot approve own uploads
      // DISABLED FOR TESTING
      // if (document.uploaded_by.toString() === userId.toString()) {
      //   throw new Error('Cannot approve your own uploads');
      // }

      // Check current status
      if (document.workflow_status !== "pending_review") {
        throw new Error(
          `Cannot approve document with status: ${document.workflow_status}`,
        );
      }

      // Generate digital signature
      const digitalSignature =
        signature || this.generateSignature(document, user);

      // Update document
      document.workflow_status = "approved";
      document.approved_by = userId;
      document.approved_at = new Date();
      document.signature = digitalSignature;
      document.last_modified_at = new Date();
      document.last_modified_by = userId;

      if (comments) {
        document.description =
          (document.description || "") + `\n\nApproval Comments: ${comments}`;
      }

      await document.save();

      return {
        success: true,
        document,
        message: "Document approved successfully",
        signature: digitalSignature,
      };
    } catch (error) {
      console.error("Error approving document:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Reject document
   * @param {string} documentId - Document ID
   * @param {string} userId - Reviewer user ID
   * @param {string} reason - Rejection reason
   */
  async rejectDocument(documentId, userId, reason) {
    try {
      const document = await Document.findById(documentId);
      if (!document) {
        throw new Error("Document not found");
      }

      const user = await User.findById(userId);
      if (!user || user.role !== "union_agent") {
        throw new Error("Only union agents can reject documents");
      }

      // Check current status
      if (document.workflow_status !== "pending_review") {
        throw new Error(
          `Cannot reject document with status: ${document.workflow_status}`,
        );
      }

      // Update document
      document.workflow_status = "rejected";
      document.reviewed_by = userId;
      document.reviewed_at = new Date();
      document.last_modified_at = new Date();
      document.last_modified_by = userId;
      document.description =
        (document.description || "") + `\n\nRejection Reason: ${reason}`;

      await document.save();

      return {
        success: true,
        document,
        message: "Document rejected",
        reason,
      };
    } catch (error) {
      console.error("Error rejecting document:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Publish approved document
   * @param {string} documentId - Document ID
   * @param {string} userId - Publisher user ID
   */
  async publishDocument(documentId, userId) {
    try {
      const document = await Document.findById(documentId);
      if (!document) {
        throw new Error("Document not found");
      }

      // Must be approved first
      if (document.workflow_status !== "approved") {
        throw new Error("Document must be approved before publishing");
      }

      const user = await User.findById(userId);
      if (!user || user.role !== "union_agent") {
        throw new Error("Only union agents can publish documents");
      }

      // Update status
      document.workflow_status = "published";
      document.last_modified_at = new Date();
      document.last_modified_by = userId;

      await document.save();

      return {
        success: true,
        document,
        message: "Document published successfully",
      };
    } catch (error) {
      console.error("Error publishing document:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate digital signature for document
   * @param {Object} document - Document object
   * @param {Object} user - User object (supervisor)
   */
  generateSignature(document, user) {
    const data = `${document._id}-${user._id}-${user.name}-${new Date().toISOString()}`;
    const hash = crypto.createHash("sha256").update(data).digest("hex");
    return `SIGN-${hash.substring(0, 16).toUpperCase()}`;
  }

  /**
   * Verify document signature
   * @param {string} documentId - Document ID
   * @param {string} signature - Signature to verify
   */
  async verifySignature(documentId, signature) {
    try {
      const document =
        await Document.findById(documentId).populate("approved_by");

      if (!document || !document.signature) {
        return {
          valid: false,
          message: "No signature found",
        };
      }

      return {
        valid: document.signature === signature,
        approver: document.approved_by?.name,
        approved_at: document.approved_at,
        signature: document.signature,
      };
    } catch (error) {
      console.error("Error verifying signature:", error);
      return {
        valid: false,
        error: error.message,
      };
    }
  }

  /**
   * Get workflow history for document
   * @param {string} documentId - Document ID
   */
  async getWorkflowHistory(documentId) {
    try {
      const document = await Document.findById(documentId)
        .populate("uploaded_by", "name role")
        .populate("reviewed_by", "name role")
        .populate("approved_by", "name role")
        .lean();

      if (!document) {
        throw new Error("Document not found");
      }

      const history = [];

      // Upload event
      history.push({
        event: "uploaded",
        status: "draft",
        user: document.uploaded_by,
        timestamp: document.uploaded_at,
        action: "Document uploaded",
      });

      // Review event
      if (document.workflow_status !== "draft") {
        history.push({
          event: "submitted_for_review",
          status: "pending_review",
          user: document.uploaded_by,
          timestamp: document.uploaded_at, // Approximate
          action: "Submitted for review",
        });
      }

      // Approval/Rejection event
      if (
        document.workflow_status === "approved" ||
        document.workflow_status === "published"
      ) {
        history.push({
          event: "approved",
          status: "approved",
          user: document.approved_by,
          timestamp: document.approved_at,
          action: "Document approved",
          signature: document.signature,
        });
      } else if (document.workflow_status === "rejected") {
        history.push({
          event: "rejected",
          status: "rejected",
          user: document.reviewed_by,
          timestamp: document.reviewed_at,
          action: "Document rejected",
        });
      }

      // Publish event
      if (document.workflow_status === "published") {
        history.push({
          event: "published",
          status: "published",
          user: document.last_modified_by,
          timestamp: document.last_modified_at,
          action: "Document published",
        });
      }

      return {
        success: true,
        history,
        current_status: document.workflow_status,
      };
    } catch (error) {
      console.error("Error getting workflow history:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

export default new DocumentWorkflowService();
