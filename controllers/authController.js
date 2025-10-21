// backend/controllers/authController.js
import User from '../models/User.js';
import UnionAgent from '../models/UnionAgent.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Helper: Generate 2-letter prefix from email
function generatePrefix(email) {
  return email.replace(/[^a-zA-Z]/g, '').substring(0, 2).toUpperCase();
}

// Register
export const register = async (req, res) => {
  const { name, email, password, role } = req.body;
  const password_hash = await bcrypt.hash(password, 10);

  if (await User.findOne({ email })) return res.status(400).json({ error: 'Email already exists' });

  const user = new User({ name, email, password_hash, role });
  await user.save();

  // If union_agent, create UnionAgent doc with prefix
  if (role === 'union_agent') {
    const prefix = generatePrefix(email);
    await new UnionAgent({ email, prefix, user: user._id }).save();
  }

  res.status(201).json({ message: 'User registered' });
};

// Login
export const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(400).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
  res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
};

// Get user details
export const getUser = async (req, res) => {
  const user = await User.findById(req.user.id).select('-password_hash');
  res.json(user);
};
