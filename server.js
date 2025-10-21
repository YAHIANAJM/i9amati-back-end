import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./db.js";
import authRoutes from './routes/auth.js';
import unionAgentRoutes from './routes/unionAgent.js';
import registerRoutes from './routes.js'
import serviceRoutes from './routes/service.js'
import dashboardRoutes from './routes/dashboard.js'
import alertsRoutes from './routes/alerts.js'
import paymentsRoutes from './routes/payments.js'

dotenv.config(); // Load environment variables

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Enable CORS with environment-based configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

// Connect DB
connectDB();

// Register API routes
app.use('/api/auth', authRoutes);
app.use('/api/union', unionAgentRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/payments', paymentsRoutes);

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }
      console.log(logLine);
    }
  });

  next();
});


// Register API routes
registerRoutes(app);


// Example route
app.get("/", (req, res) => {
  res.send("Iqamati API is running...");
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
  console.error(err);
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`📡 API endpoints available at http://localhost:${PORT}/api`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
});
