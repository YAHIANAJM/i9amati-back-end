import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const JournalLineSchema = new Schema({
  journalEntry: { type: Schema.Types.ObjectId, ref: 'JournalEntry', required: true },
  accountNumber: { type: String, required: true }, // reference to Account.number
  debit: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
  owner: { type: Schema.Types.ObjectId, ref: 'User' }, // optional, for tracking
  unit: { type: Schema.Types.ObjectId, ref: 'Apartment' }, // optional, for tracking (changed from Unit)
  description: { type: String },
}, { timestamps: true });

JournalLineSchema.index({ journalEntry: 1 });
JournalLineSchema.index({ accountNumber: 1 });

const JournalLine = mongoose.model('JournalLine', JournalLineSchema);
export default JournalLine;
