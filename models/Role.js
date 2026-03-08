import mongoose from 'mongoose';

const RoleSchema = new mongoose.Schema({
  role_name: {
    type: String,
    enum: ['OWNER','AGENT','SUPERVISOR','GUEST'],
    unique: true,
    required: true
  }
});

export default mongoose.model('Role', RoleSchema);
