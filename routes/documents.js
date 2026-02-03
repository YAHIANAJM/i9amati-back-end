import express from 'express';
import multer from 'multer';
import path from 'path';
import { auth } from '../middleware/auth.js';
import Document from '../models/Document.js';
import documentAccessControl from '../services/documentAccessControl.js';
import documentWorkflowService from '../services/documentWorkflowService.js';
import documentVersioningService from '../services/documentVersioningService.js';
import documentNotificationService from '../services/documentNotificationService.js';
import documentController from '../controllers/documentController.js';
import { v2 as cloudinary } from 'cloudinary';
import crypto from 'crypto';
import streamifier from 'streamifier';

const router = express.Router();

// Configure Cloudinary
const cloudinaryConfigured = 
  process.env.CLOUDINARY_CLOUD_NAME && 
  process.env.CLOUDINARY_API_KEY && 
  process.env.CLOUDINARY_API_SECRET;

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

// Configure multer for file uploads (use memory storage for Cloudinary)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common document types
    const allowedTypes = /pdf|doc|docx|xls|xlsx|ppt|pptx|txt|jpg|jpeg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, JPG, PNG'));
    }
  }
});

/**
 * GET /api/documents - List accessible documents
 */
router.get('/', auth, async (req, res) => {
  try {
    const { category, status, apartment_id } = req.query;
    
    const filters = {};
    if (category) filters.category = category;
    if (apartment_id) filters.apartment_id = apartment_id;

    const documents = await documentAccessControl.getAccessibleDocuments(
      req.user.id,
      req.user.role,
      filters
    );

    res.json({
      success: true,
      count: documents.length,
      documents
    });
  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/documents/stats - Get dashboard statistics
 */
router.get('/stats', auth, documentController.getDashboardStats);

/**
 * GET /api/documents/search - Search documents
 */
router.get('/search', auth, documentController.searchDocuments);

/**
 * GET /api/documents/pending - Get pending reviews (agents only)
 */
router.get('/pending', auth, documentController.getPendingReviews);

/**
 * GET /api/documents/analytics - Get analytics
 */
router.get('/analytics', auth, documentController.getDocumentAnalytics);

/**
 * POST /api/documents/upload - Upload new document
 */
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!cloudinaryConfigured) {
      return res.status(503).json({ error: 'File upload service not configured' });
    }

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const fileExt = path.extname(req.file.originalname);
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          folder: 'documents',
          public_id: `doc_${Date.now()}_${Math.round(Math.random() * 1E9)}${fileExt}`,
          type: 'upload'
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
    });

    const metadata = {
      title: req.body.title || req.file.originalname,
      description: req.body.description,
      category: req.body.category || 'Other',
      access_level: req.body.access_level || 'owner_only',
      apartment_id: req.body.apartment_id,
      is_sensitive: req.body.is_sensitive === 'true',
      tags: req.body.tags ? JSON.parse(req.body.tags) : []
    };

    const fileData = {
      path: uploadResult.public_id,
      cloudinaryUrl: uploadResult.secure_url,
      resourceType: uploadResult.resource_type,
      size: req.file.size,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname
    };

    const result = await documentWorkflowService.uploadDocument(
      fileData,
      metadata,
      req.user.id
    );

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/documents/:id/submit - Submit document for review
 */
router.post('/:id/submit', auth, async (req, res) => {
  try {
    const result = await documentWorkflowService.submitForReview(
      req.params.id,
      req.user.id
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error submitting document:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/documents/:id/approve - Approve document
 */
router.post('/:id/approve', auth, async (req, res) => {
  try {
    const { signature, comments } = req.body;

    const result = await documentWorkflowService.approveDocument(
      req.params.id,
      req.user.id,
      { signature, comments }
    );

    if (result.success) {
      // Send approval notification
      const document = result.document;
      const User = (await import('../models/User.js')).default;
      const approver = await User.findById(req.user.id);
      
      await documentNotificationService.notifyDocumentApproved(
        document,
        approver.name
      );

      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error approving document:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/documents/:id/reject - Reject document
 */
router.post('/:id/reject', auth, async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const result = await documentWorkflowService.rejectDocument(
      req.params.id,
      req.user.id,
      reason
    );

    if (result.success) {
      // Send rejection notification
      const document = result.document;
      const User = (await import('../models/User.js')).default;
      const reviewer = await User.findById(req.user.id);
      
      await documentNotificationService.notifyDocumentRejected(
        document,
        reviewer.name,
        reason
      );

      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error rejecting document:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/documents/:id/publish - Publish approved document
 */
router.post('/:id/publish', auth, async (req, res) => {
  try {
    const result = await documentWorkflowService.publishDocument(
      req.params.id,
      req.user.id
    );

    if (result.success) {
      // Send publication notification
      await documentNotificationService.notifyDocumentPublished(result.document);
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error publishing document:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/documents/:id - Get document details
 */
router.get('/:id', auth, async (req, res) => {
  try {
    // Check access
    const hasAccess = await documentAccessControl.canAccessDocument(
      req.params.id,
      req.user.id,
      req.user.role
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const document = await Document.findById(req.params.id)
      .populate('uploaded_by', 'name role email')
      .populate('approved_by', 'name role')
      .populate('last_modified_by', 'name role')
      .populate('apartment_id', 'number building_id')
      .lean();

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({
      success: true,
      document
    });
  } catch (error) {
    console.error('Error getting document:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/documents/:id/versions - Get version history
 */
router.get('/:id/versions', auth, async (req, res) => {
  try {
    const result = await documentVersioningService.getVersionHistory(req.params.id);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Error getting versions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/documents/:id/restore/:version - Restore previous version
 */
router.post('/:id/restore/:version', auth, async (req, res) => {
  try {
    const result = await documentVersioningService.restoreVersion(
      req.params.id,
      parseInt(req.params.version),
      req.user.id
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error restoring version:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/documents/:id/download - Download document
 */
router.get('/:id/download', auth, async (req, res) => {
  try {
    // Check access
    const hasAccess = await documentAccessControl.canAccessDocument(
      req.params.id,
      req.user.id,
      req.user.role
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!cloudinaryConfigured) {
      return res.status(503).json({ error: 'File download service not configured' });
    }

    // Generate signed download URL
    const publicId = document.file_path;
    const timestamp = Math.round(Date.now() / 1000);
    const filename = document.title;
    
    const params = {
      attachment: 'true',
      public_id: publicId,
      target_filename: filename,
      timestamp: timestamp.toString(),
      type: 'upload'
    };
    
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    const stringToSign = sortedParams + process.env.CLOUDINARY_API_SECRET;
    const signature = crypto.createHash('sha256').update(stringToSign).digest('hex');
    
    // Use stored resource_type or default to 'raw' for documents
    const resourceType = document.resource_type || 'raw';
    const downloadUrl = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/download?` +
      `api_key=${process.env.CLOUDINARY_API_KEY}&` +
      `attachment=true&` +
      `public_id=${encodeURIComponent(publicId)}&` +
      `signature=${signature}&` +
      `target_filename=${encodeURIComponent(filename)}&` +
      `timestamp=${timestamp}&` +
      `type=upload`;

    res.json({ url: downloadUrl });
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/documents/:id/workflow-history - Get workflow history
 */
router.get('/:id/workflow-history', auth, async (req, res) => {
  try {
    const result = await documentWorkflowService.getWorkflowHistory(req.params.id);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Error getting workflow history:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/documents/:id/permissions - Update document permissions
 */
router.put('/:id/permissions', auth, async (req, res) => {
  try {
    // Only agents can modify permissions
    if (req.user.role !== 'union_agent') {
      return res.status(403).json({ error: 'Only union agents can modify permissions' });
    }

    const permissions = {
      access_level: req.body.access_level,
      allowed_users: req.body.allowed_users,
      allowed_roles: req.body.allowed_roles,
      apartment_id: req.body.apartment_id
    };

    const result = await documentAccessControl.setDocumentPermissions(
      req.params.id,
      permissions
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error updating permissions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/documents/:id - Archive document
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    // Only agents can archive
    if (req.user.role !== 'union_agent') {
      return res.status(403).json({ error: 'Only union agents can archive documents' });
    }

    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    document.is_archived = true;
    document.archived_at = new Date();
    document.archived_by = req.user.id;
    await document.save();

    res.json({
      success: true,
      message: 'Document archived successfully'
    });
  } catch (error) {
    console.error('Error archiving document:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
