import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const AccountSchema = new Schema({
  number: { type: String, required: true, unique: true }, // e.g. 3421, 7111
  name: { type: String, required: true },
  type: { type: String, enum: ['asset', 'liability', 'revenue', 'expense', 'treasury'], required: true },
  isSystem: { type: Boolean, default: false }, // true for core accounts
}, { timestamps: true });

const Account = mongoose.model('Account', AccountSchema);
export default Account;
