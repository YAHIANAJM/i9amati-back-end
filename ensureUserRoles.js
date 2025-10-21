import mongoose from 'mongoose';
import User from './models/User.js';
import dotenv from 'dotenv';
dotenv.config();

async function ensureUserRoles() {
  await mongoose.connect(process.env.MONGO_URI);

  // Example logic: set role based on email pattern or existing data
  const updates = [];
  const users = await User.find({});
  for (const user of users) {
    if (!user.role) {
      let role = 'property_owner';
      if (user.email?.includes('agent')) role = 'union_agent';
      if (user.email?.includes('supervisor')) role = 'supervisor';
      user.role = role;
      updates.push(user.save());
      console.log(`Set role for ${user.email} to ${role}`);
    }
  }
  await Promise.all(updates);
  console.log('All users now have a role field.');
  process.exit();
}

ensureUserRoles();
