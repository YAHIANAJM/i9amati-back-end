import mongoose from 'mongoose';

/**
 * Enhanced Document Model with Versioning, Access Control, and Approval Workflow
 * Supports: version tracking, permissions, approval workflow, and metadata
 */
const DocumentSchema = new mongoose.Schema({
  // Basic Information
  residence_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Residence' },
  building_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Building' },
  apartment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Apartment' }, // Link to specific unit
  title: { type: String, required: true },
  description: { type: String },
  type: { type: String }, // e.g. PDF, DOCX, XLSX
  category: { 
    type: String, 
    enum: ['Legal', 'Financial', 'Maintenance', 'Insurance', 'Contract', 'Other'],
    required: true 
  },
  
  // File Information
  file_path: { type: String, required: true },
  url: { type: String }, // Public URL if applicable
  size_bytes: { type: Number },
  mime_type: { type: String },
  
  // Version Information
  version: { type: Number, default: 1 },
  is_latest: { type: Boolean, default: true },
  parent_document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' }, // Original document
  
  // Access Control
  access_level: {
    type: String,
    enum: ['public', 'agent_only', 'owner_only', 'unit_specific', 'restricted'],
    default: 'owner_only'
  },
  allowed_users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Specific users
  allowed_roles: [{ type: String, enum: ['union_agent', 'property_owner', 'tenant'] }],
  
  // Approval Workflow
  workflow_status: {
    type: String,
    enum: ['draft', 'pending_review', 'approved', 'rejected', 'published'],
    default: 'draft'
  },
  uploaded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  signature: { type: String }, // Digital signature of supervisor
  
  // Metadata
  is_sensitive: { type: Boolean, default: false }, // Trigger notifications
  tags: [{ type: String }],
  expiry_date: { type: Date }, // For documents that expire
  
  // Timestamps
  uploaded_at: { type: Date, default: Date.now },
  reviewed_at: { type: Date },
  approved_at: { type: Date },
  last_modified_at: { type: Date },
  last_modified_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Archive
  is_archived: { type: Boolean, default: false },
  archived_at: { type: Date },
  archived_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for version history
DocumentSchema.virtual('versions', {
  ref: 'DocumentVersion',
  localField: '_id',
  foreignField: 'document_id'
});

// Indexes for performance
DocumentSchema.index({ residence_id: 1, category: 1 });
DocumentSchema.index({ workflow_status: 1 });
DocumentSchema.index({ is_latest: 1, is_archived: 1 });
DocumentSchema.index({ apartment_id: 1 });

// Pre-save middleware to update modification timestamp
DocumentSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.last_modified_at = new Date();
  }
  next();
});

export default mongoose.model('Document', DocumentSchema);
