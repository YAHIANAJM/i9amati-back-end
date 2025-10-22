import { createServer } from "http";
import { storage } from "./storage.js";

async function registerRoutes(app) {
  // Sample API routes
  
  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      // Add your authentication logic here
      res.json({ success: true, message: "Login successful" });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    res.json({ success: true, message: "Logout successful" });
  });

  // User profile routes
  app.get("/api/user/profile", (req, res) => {
    res.json({ 
      user: { 
        id: 1, 
        name: "John Doe", 
        role: "owner" 
      } 
    });
  });

  // Dashboard data routes
  app.get("/api/dashboard/stats", (req, res) => {
    res.json({
      stats: {
        payments: { total: 1200, pending: 300 },
        votes: { active: 2, completed: 8 },
        complaints: { open: 3, resolved: 15 }
      }
    });
  });

  // Payments routes
  app.get("/api/payments", (req, res) => {
    res.json({
      payments: [
        { id: 1, amount: 500, status: "paid", date: "2024-01-15" },
        { id: 2, amount: 300, status: "pending", date: "2024-02-15" }
      ]
    });
  });

  // Voting routes
  app.get("/api/voting", (req, res) => {
    res.json({
      
      votes: [
        { id: 1, title: "Building maintenance", status: "active", deadline: "2024-02-01" },
        { id: 2, title: "Parking rules", status: "completed", result: "approved" }
      ]
    });
  });

  // Complaints routes
  app.get("/api/complaints", (req, res) => {
    res.json({
      complaints: [
        { id: 1, title: "Noise complaint", status: "open", date: "2024-01-20" },
        { id: 2, title: "Water leak", status: "resolved", date: "2024-01-18" }
      ]
    });
  });

  app.post("/api/complaints", (req, res) => {
    const { title, description } = req.body;
    res.json({ 
      success: true, 
      complaint: { id: 3, title, description, status: "open" } 
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}

export default registerRoutes;