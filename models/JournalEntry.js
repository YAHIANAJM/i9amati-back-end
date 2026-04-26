import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const JournalEntrySchema = new Schema({
  date: { type: Date, required: true },
  description: { type: String, required: true },
  type: { type: String, enum: ['general', 'bank', 'cash'], default: 'general' },
  lines: [{ type: Schema.Types.ObjectId, ref: 'JournalLine' }],
  status: { type: String, enum: ['active', 'reversed', 'cancelled'], default: 'active' },
  reference: { type: String }, // e.g. payment, contribution, etc.
  entryNumber: { type: Number }, // Sequential number for Art 8 compliance
  reversalOf: { type: Schema.Types.ObjectId, ref: 'JournalEntry' }, // Link to corrected entry
  residence_id: { type: Schema.Types.ObjectId, ref: 'Building' },
}, { timestamps: true });

// Decree Art 8 Rule: No direct edits or deletions allowed for confirmed entries
JournalEntrySchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew && this.status === 'active') {
    // Check if we are trying to change something other than status
    const modifiedFields = this.modifiedPaths();
    if (modifiedFields.includes('date') || modifiedFields.includes('description') || modifiedFields.includes('lines')) {
      const err = new Error('Decree Article 8 Rule: Confirmed journal entries cannot be edited. Use adjustment entries instead.');
      return next(err);
    }
  }
  next();
});

JournalEntrySchema.pre('findOneAndDelete', async function(next) {
  const err = new Error('Decree Article 8 Rule: Journal entries cannot be deleted. Use reversal entries instead.');
  next(err);
});

JournalEntrySchema.pre('deleteOne', async function(next) {
  const err = new Error('Decree Article 8 Rule: Journal entries cannot be deleted. Use reversal entries instead.');
  next(err);
});

const JournalEntry = mongoose.model('JournalEntry', JournalEntrySchema);
export default JournalEntry;
