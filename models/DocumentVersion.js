import mongoose from 'mongoose';

/**
 * Document Version Model
 * Tracks all versions of a document for complete history and rollback capability
 */
const DocumentVersionSchema = new mongoose.Schema({
  // Reference to main document
  document_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Document', 
    required: true,
    index: true
  },
  
  // Version Information
  version_number: { type: Number, required: true },
  title: { type: String, required: true },
  description: { type: String },
  
  // File Information (snapshot of this version)
  file_path: { type: String, required: true },
  url: { type: String },
  size_bytes: { type: Number },
  mime_type: { type: String },
  
  // Change Information
  change_summary: { type: String }, // What changed in this version
  change_type: {
    type: String,
    enum: ['created', 'updated', 'minor_edit', 'major_revision', 'restored'],
    default: 'updated'
  },
  
  // User Information
  created_by: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  created_by_name: { type: String }, // Cached for display
  created_by_role: { type: String }, // Cached for display
  
  // Metadata at time of version
  category: { type: String },
  access_level: { type: String },
  workflow_status: { type: String },
  
  // Timestamps
  created_at: { type: Date, default: Date.now },
  
  // Restore Information
  is_current: { type: Boolean, default: false }, // Is this the current version?
  restored_from: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentVersion' }
}, {
  timestamps: true
});

// Compound index for efficient version queries
DocumentVersionSchema.index({ document_id: 1, version_number: -1 });
DocumentVersionSchema.index({ document_id: 1, is_current: 1 });

// Static method to get version history for a document
DocumentVersionSchema.statics.getHistory = async function(documentId) {
  return this.find({ document_id: documentId })
    .sort({ version_number: -1 })
    .populate('created_by', 'name email role')
    .lean();
};

// Static method to get specific version
DocumentVersionSchema.statics.getVersion = async function(documentId, versionNumber) {
  return this.findOne({ 
    document_id: documentId, 
    version_number: versionNumber 
  })
    .populate('created_by', 'name email role')
    .lean();
};

// Method to compare with another version
DocumentVersionSchema.methods.compareTo = async function(otherVersionNumber) {
  const otherVersion = await this.constructor.getVersion(
    this.document_id, 
    otherVersionNumber
  );
  
  if (!otherVersion) return null;
  
  return {
    current: {
      version: this.version_number,
      size: this.size_bytes,
      modified_by: this.created_by_name,
      modified_at: this.created_at
    },
    other: {
      version: otherVersion.version_number,
      size: otherVersion.size_bytes,
      modified_by: otherVersion.created_by_name,
      modified_at: otherVersion.created_at
    },
    changes: {
      size_diff: this.size_bytes - otherVersion.size_bytes,
      time_diff: this.created_at - otherVersion.created_at
    }
  };
};

export default mongoose.model('DocumentVersion', DocumentVersionSchema);
