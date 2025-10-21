const mongoose = require('mongoose');

const RoleSchema = new mongoose.Schema({
  role_name: {
    type: String,
    enum: ['OWNER','AGENT','SUPERVISOR','GUEST'],
    unique: true,
    required: true
  }
});

module.exports = mongoose.model('Role', RoleSchema);
