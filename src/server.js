require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const pool = require("./db/pool");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 500 }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS database_time");
    res.json({ success: true, database_time: result.rows[0].database_time });
  } catch (error) {
    console.error("Health check database error:", error.message);
    res.status(500).json({ success: false, message: "Database connection failed." });
  }
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/listings", require("./routes/listings"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/chat", require("./routes/chat"));
app.use("/api/wishlist", require("./routes/wishlist"));
app.use("/api/reviews", require("./routes/reviews"));

app.get("/api", (_req, res) => {
  res.json({
    name: "Barter",
    message: "Barter marketplace API",
    features: ["accounts", "listings", "orders", "Razorpay checkout scaffolding", "buyer-seller messaging", "wishlist", "reviews"]
  });
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "API endpoint not found." });
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error("Request error:", error);
  if (error.code === "23505") return res.status(409).json({ error: "This record already exists." });
  if (error.code === "23503") return res.status(400).json({ error: "A referenced record does not exist." });
  res.status(500).json({ error: "Server error. Check the terminal for details." });
});

app.listen(PORT, () => {
  console.log(`Barter Marketplace running at http://localhost:${PORT}`);
});
