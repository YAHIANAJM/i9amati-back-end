// backend/middleware/auth.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// JWT authentication middleware

export const auth = async (req, res, next) => {
  let token = req.cookies?.token || req.headers.authorization?.split(' ')[1];

  // Also check lowercase authorization just in case
  if (!token && req.headers.authorization) {
    token = req.headers.authorization.split(' ')[1];
  }

  console.log('--- AUTH DEBUG ---');
  console.log('Cookies:', req.cookies);
  console.log('Authorization header:', req.headers.authorization);
  console.log('Extracted token:', token ? 'Found' : 'Missing');
  if (!token) {
    console.log('No token provided');
    return res.status(401).json({ error: 'No token' });
  }
  try {
    const secret = process.env.JWT_SECRET || 'secret';
    const decoded = jwt.verify(token, secret);
    console.log('Decoded JWT:', decoded);
    
    // Fetch full user object for building filtering
    const user = await User.findById(decoded.id).select('-password_hash');
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    req.user = {
      _id: user._id,
      id: user._id.toString(),
      role: user.role,
      name: user.name,
      email: user.email
    };
    next();
  } catch (err) {
    console.log('JWT verification error:', err.message);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Role-based access control middleware
export const requireRole = (role) => (req, res, next) => {
  if (req.user.role !== role) return res.status(403).json({ error: 'Forbidden' });
  next();
};
