const express = require("express");
const pool = require("../db/pool");
const { authRequired } = require("../middleware/auth");
const router = express.Router();

router.get("/", authRequired, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT l.* FROM wishlist w JOIN listings l ON l.id=w.listing_id
       WHERE w.user_id=$1 ORDER BY w.created_at DESC`,
      [req.user.id]
    );
    res.json({ listings: result.rows });
  } catch (error) { next(error); }
});

router.post("/:listingId", authRequired, async (req, res, next) => {
  try {
    await pool.query(
      `INSERT INTO wishlist (user_id,listing_id) VALUES ($1,$2)
       ON CONFLICT (user_id,listing_id) DO NOTHING`,
      [req.user.id, req.params.listingId]
    );
    res.status(201).json({ success: true });
  } catch (error) { next(error); }
});

router.delete("/:listingId", authRequired, async (req, res, next) => {
  try {
    await pool.query("DELETE FROM wishlist WHERE user_id=$1 AND listing_id=$2", [req.user.id, req.params.listingId]);
    res.json({ success: true });
  } catch (error) { next(error); }
});

module.exports = router;
