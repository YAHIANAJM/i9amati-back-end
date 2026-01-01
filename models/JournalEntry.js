import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const JournalEntrySchema = new Schema({
  date: { type: Date, required: true },
  description: { type: String, required: true },
  type: { type: String, enum: ['general', 'bank', 'cash'], default: 'general' },
  lines: [{ type: Schema.Types.ObjectId, ref: 'JournalLine' }],
  status: { type: String, enum: ['active', 'reversed', 'cancelled'], default: 'active' },
  reference: { type: String }, // e.g. payment, contribution, etc.
}, { timestamps: true });

const JournalEntry = mongoose.model('JournalEntry', JournalEntrySchema);
export default JournalEntry;
