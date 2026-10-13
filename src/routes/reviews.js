const express = require("express");
const pool = require("../db/pool");
const { authRequired } = require("../middleware/auth");
const router = express.Router();

router.get("/seller/:sellerId", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT r.id,r.rating,r.comment,r.created_at,u.name AS reviewer_name
       FROM reviews r JOIN users u ON u.id=r.reviewer_id
       WHERE r.seller_id=$1 ORDER BY r.created_at DESC`,
      [req.params.sellerId]
    );
    res.json({ reviews: result.rows });
  } catch (error) { next(error); }
});

router.post("/", authRequired, async (req, res, next) => {
  try {
    const { order_id, rating, comment = "" } = req.body;
    const score = Number(rating);
    if (!order_id || !Number.isInteger(score) || score < 1 || score > 5) {
      return res.status(400).json({ error: "Order and rating from 1 to 5 are required." });
    }
    const orderResult = await pool.query(
      `SELECT * FROM orders WHERE id=$1 AND buyer_id=$2 AND payment_status='paid' AND status='delivered'`,
      [order_id, req.user.id]
    );
    const order = orderResult.rows[0];
    if (!order) return res.status(403).json({ error: "Only a buyer with a delivered, paid order can review the seller." });

    const result = await pool.query(
      `INSERT INTO reviews (order_id,reviewer_id,seller_id,rating,comment)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [order.id, req.user.id, order.seller_id, score, comment]
    );
    res.status(201).json({ review: result.rows[0] });
  } catch (error) { next(error); }
});

module.exports = router;
