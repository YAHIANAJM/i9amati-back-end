import mongoose from 'mongoose';
import User from './models/User.js';
import UnionAgent from './models/UnionAgent.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

async function resetUnionAgent() {
  await mongoose.connect(process.env.MONGO_URI);

  const email = 'ac1003.agent@example.com';
  const password = 'AC1003pass!';
  const name = 'Union Agent AC1003';
  const prefix = 'AC';

  // Remove existing user and agent
  await User.deleteOne({ email });
  await UnionAgent.deleteOne({ email });

  const password_hash = await bcrypt.hash(password, 10);
  const user = new User({
    name,
    email,
    password_hash,
    role: 'union_agent',
    status: 'ACTIVE'
  });
  await user.save();

  await new UnionAgent({ email, prefix, user: user._id }).save();

  console.log('Reset union agent:');
  console.log('Email:', email);
  console.log('Password:', password);
  process.exit();
}

resetUnionAgent();
