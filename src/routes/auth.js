const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    city: row.city,
    avatar_url: row.avatar_url,
    seller_onboarding_status: row.seller_onboarding_status,
    created_at: row.created_at
  };
}

router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password, city = "" } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required." });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const existing = await pool.query("SELECT id FROM users WHERE LOWER(email)=LOWER($1)", [email]);
    if (existing.rowCount) return res.status(409).json({ error: "An account with this email already exists." });

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (name,email,password_hash,city)
       VALUES ($1,$2,$3,$4)
       RETURNING id,name,email,city,avatar_url,seller_onboarding_status,created_at`,
      [String(name).trim(), String(email).trim(), passwordHash, String(city).trim()]
    );
    const user = publicUser(result.rows[0]);
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ user, token });
  } catch (error) { next(error); }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query(
      `SELECT id,name,email,city,avatar_url,password_hash,seller_onboarding_status,created_at
       FROM users WHERE LOWER(email)=LOWER($1)`,
      [email || ""]
    );
    const row = result.rows[0];
    if (!row || !await bcrypt.compare(password || "", row.password_hash)) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    const user = publicUser(row);
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ user, token });
  } catch (error) { next(error); }
});

router.get("/me", authRequired, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id,name,email,city,avatar_url,seller_onboarding_status,created_at
       FROM users WHERE id=$1`,
      [req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "User not found." });
    res.json({ user: publicUser(result.rows[0]) });
  } catch (error) { next(error); }
});

router.patch("/profile", authRequired, async (req, res, next) => {
  try {
    const { name, city, avatar_url } = req.body;
    const result = await pool.query(
      `UPDATE users SET
       name=COALESCE($2,name),
       city=COALESCE($3,city),
       avatar_url=COALESCE($4,avatar_url),
       updated_at=NOW()
       WHERE id=$1
       RETURNING id,name,email,city,avatar_url,seller_onboarding_status,created_at`,
      [req.user.id, name ?? null, city ?? null, avatar_url ?? null]
    );
    res.json({ user: publicUser(result.rows[0]) });
  } catch (error) { next(error); }
});

module.exports = router;
