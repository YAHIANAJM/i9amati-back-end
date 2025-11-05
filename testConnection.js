import mongoose from "mongoose";

mongoose.connect("mongodb+srv://i9amati_db:YDJmm4mbOu4nTZXm@cluster0.e6os8wy.mongodb.net/?appName=Cluster0")
  .then(() => console.log("✅ Connected successfully!"))
  .catch((err) => console.error("❌ Connection failed:", err));
