// backend/routes/auth.js
import express from "express";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

// Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ message: "Server configuration error" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      secret,
      { expiresIn: "1d" }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    const { password_hash, ...userData } = user.toObject();
    res.json({ token, user: userData });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Get current user
router.get("/me", async (req, res) => {
  try {
    let token = req.cookies.token;
    
    // Fallback to Authorization header if cookie is missing
    if (!token && req.headers.authorization) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) return res.status(401).json({ message: "Not authenticated" });

    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ message: "Server configuration error" });

    const decoded = jwt.verify(token, secret);
    let user = await User.findById(decoded.id).select("-password_hash");

    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.role === 'union_agent') {
      const Building = (await import('../models/Building.js')).default;
      const building = await Building.findOne({ agent: user._id }).select('_id building_name building_code');
      user = user.toObject();
      user.building = building;
    }

    res.json(user);
  } catch (err) {
    res.status(401).json({ message: "Invalid token" });
  }
});

// Logout
router.post("/logout", (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  });
  res.json({ message: "Logged out successfully" });
});

// Register — TODO: implement registration logic
router.post("/register", (req, res) => {
  res.status(501).json({ message: "Registration not implemented" });
});

export default router;
