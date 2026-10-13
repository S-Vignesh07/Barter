const express = require("express");
const pool = require("../db/pool");
const { authRequired } = require("../middleware/auth");
const router = express.Router();

router.get("/:listingId", authRequired, async (req, res, next) => {
  try {
    const listing = await pool.query(
      "SELECT id, owner_id AS seller_id FROM listings WHERE id=$1",
      [req.params.listingId]
    );
    if (!listing.rowCount) return res.status(404).json({ error: "Listing not found." });

    const sellerId = listing.rows[0].seller_id;
    const isParticipant = req.user.id === sellerId || await pool.query(
      "SELECT 1 FROM messages WHERE listing_id=$1 AND ((sender_id=$2 AND receiver_id=$3) OR (sender_id=$3 AND receiver_id=$2)) LIMIT 1",
      [req.params.listingId, req.user.id, sellerId]
    ).then(r => r.rowCount > 0);

    if (!isParticipant) {
      const hasOrder = await pool.query(
        "SELECT 1 FROM orders WHERE listing_id=$1 AND buyer_id=$2",
        [req.params.listingId, req.user.id]
      );
      if (!hasOrder.rowCount) return res.status(403).json({ error: "You must contact the seller or place an order to access this conversation." });
    }

    const result = await pool.query(
      `SELECT m.id,m.sender_id,m.receiver_id,m.body,m.created_at,u.name AS sender_name
       FROM messages m JOIN users u ON u.id=m.sender_id
       WHERE m.listing_id=$1 AND
       ((m.sender_id=$2 AND m.receiver_id=$3) OR (m.sender_id=$3 AND m.receiver_id=$2))
       ORDER BY m.created_at ASC`,
      [req.params.listingId, req.user.id, sellerId]
    );
    res.json({ messages: result.rows, seller_id: sellerId });
  } catch (error) { next(error); }
});

router.post("/:listingId", authRequired, async (req, res, next) => {
  try {
    const body = String(req.body.body || "").trim();
    if (!body) return res.status(400).json({ error: "Message cannot be empty." });
    if (body.length > 3000) return res.status(400).json({ error: "Message is too long." });

    const listingResult = await pool.query(
      "SELECT id, owner_id AS seller_id, status FROM listings WHERE id=$1",
      [req.params.listingId]
    );
    const listing = listingResult.rows[0];
    if (!listing) return res.status(404).json({ error: "Listing not found." });
    if (listing.seller_id === req.user.id) {
      const receiverId = req.body.receiver_id;
      if (!receiverId) return res.status(400).json({ error: "Seller must provide the buyer's receiver_id." });
      const buyer = await pool.query(
        `SELECT 1 FROM messages WHERE listing_id=$1 AND sender_id=$2 AND receiver_id=$3
         UNION SELECT 1 FROM orders WHERE listing_id=$1 AND buyer_id=$3 AND seller_id=$2 LIMIT 1`,
        [listing.id, receiverId, req.user.id]
      );
      if (!buyer.rowCount) return res.status(403).json({ error: "No conversation exists with this buyer." });
      const result = await pool.query(
        `INSERT INTO messages (listing_id,sender_id,receiver_id,body)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [listing.id, req.user.id, receiverId, body]
      );
      return res.status(201).json({ message: result.rows[0] });
    }

    const result = await pool.query(
      `INSERT INTO messages (listing_id,sender_id,receiver_id,body)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [listing.id, req.user.id, listing.seller_id, body]
    );
    res.status(201).json({ message: result.rows[0] });
  } catch (error) { next(error); }
});

module.exports = router;