// backend/routes/auth.js
// Basic Express authentication routes template

import express from "express";
const router = express.Router();

// Example login route

import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    // Create JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "1d" }
    );

    // Set HttpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // true in production
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' for cross-site cookie in prod
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    // Return user info (excluding password_hash)
    const { password_hash, ...userData } = user.toObject();
    res.json({ token, user: userData });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Check Logged In User
router.get("/me", async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: "Not authenticated" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    let user = await User.findById(decoded.id).select("-password_hash");

    if (!user) return res.status(404).json({ message: "User not found" });

    // For union agents, find their building
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

router.post("/logout", (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  });
  res.json({ message: "Logged out successfully" });
});

// Example register route
router.post("/register", (req, res) => {
  // TODO: Implement registration logic
  res.send("Register route");
});

export default router;
