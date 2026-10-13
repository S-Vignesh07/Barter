const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const pool = require("../db/pool");
const { authRequired } = require("../middleware/auth");
const router = express.Router();

function razorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
}

router.post("/", authRequired, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { listing_id, quantity = 1, delivery_address } = req.body;
    const qty = Number(quantity);
    if (!listing_id || !Number.isInteger(qty) || qty < 1 || !delivery_address) {
      return res.status(400).json({ error: "Listing, valid quantity and delivery address are required." });
    }

    await client.query("BEGIN");
    const listingResult = await client.query(
      `SELECT * FROM listings WHERE id=$1 AND status='active' AND quantity >= $2 FOR UPDATE`,
      [listing_id, qty]
    );
    const listing = listingResult.rows[0];
    if (!listing) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This item is unavailable or has insufficient stock." });
    }

    // FIX: the listings table stores the seller in owner_id
    const sellerId = listing.owner_id || listing.seller_id;
    if (!sellerId) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This listing has no seller assigned." });
    }
    if (sellerId === req.user.id) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "You cannot buy your own listing." });
    }
    if (listing.listing_type === "swap" || listing.price === null) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "This listing is swap-only and cannot be purchased." });
    }

    const total = Number(listing.price) * qty;
    const orderResult = await client.query(
      `INSERT INTO orders (buyer_id,seller_id,listing_id,quantity,total_amount,delivery_address,status,payment_status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending_payment','pending') RETURNING *`,
      [req.user.id, sellerId, listing.id, qty, total, delivery_address]
    );
    const order = orderResult.rows[0];

    let checkout = null;
    const razorpay = razorpayClient();
    if (razorpay) {
      const rpOrder = await razorpay.orders.create({
        amount: Math.round(total * 100),
        currency: "INR",
        receipt: String(order.id).replace(/-/g, "").slice(0, 40),
        notes: { marketplace_order_id: order.id, listing_id: listing.id }
      });
      await client.query(
        `UPDATE orders SET razorpay_order_id=$2 WHERE id=$1`,
        [order.id, rpOrder.id]
      );
      checkout = {
        key_id: process.env.RAZORPAY_KEY_ID,
        razorpay_order_id: rpOrder.id,
        amount: rpOrder.amount,
        currency: rpOrder.currency,
        marketplace_order_id: order.id
      };
    }

    await client.query("COMMIT");
    res.status(201).json({
      order: { ...order, total_amount: total },
      checkout,
      message: checkout
        ? "Order created. Complete Razorpay checkout and verify payment."
        : "Order created, but Razorpay is not configured. Add test credentials to .env."
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

router.post("/:id/verify-payment", authRequired, async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing Razorpay payment verification fields." });
    }

    const result = await pool.query(
      `SELECT * FROM orders WHERE id=$1 AND buyer_id=$2`,
      [req.params.id, req.user.id]
    );
    const order = result.rows[0];
    if (!order || order.razorpay_order_id !== razorpay_order_id) {
      return res.status(404).json({ error: "Order not found." });
    }

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const a = Buffer.from(expected);
    const b = Buffer.from(String(razorpay_signature));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(400).json({ error: "Payment signature verification failed." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [order.id]);
      if (locked.rows[0].payment_status === "paid") {
        await client.query("COMMIT");
        return res.json({ success: true, message: "Payment was already verified." });
      }

      const listingResult = await client.query(
        "SELECT * FROM listings WHERE id=$1 FOR UPDATE", [order.listing_id]
      );
      const listing = listingResult.rows[0];
      if (!listing || listing.quantity < order.quantity || listing.status !== "active") {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Inventory changed. Contact support for payment resolution." });
      }

      await client.query(
        `UPDATE orders SET payment_status='paid',status='confirmed',
         razorpay_payment_id=$2,paid_at=NOW(),updated_at=NOW() WHERE id=$1`,
        [order.id, razorpay_payment_id]
      );
      const remaining = listing.quantity - order.quantity;
      await client.query(
        `UPDATE listings SET quantity=$2,status=$3,updated_at=NOW() WHERE id=$1`,
        [listing.id, remaining, remaining === 0 ? "sold" : "active"]
      );
      await client.query(
        `INSERT INTO payments (order_id,buyer_id,seller_id,provider_payment_id,amount,currency,status)
         VALUES ($1,$2,$3,$4,$5,'INR','paid')
         ON CONFLICT (provider_payment_id) DO NOTHING`,
        [order.id, order.buyer_id, order.seller_id, razorpay_payment_id, order.total_amount]
      );
      await client.query("COMMIT");
      res.json({
        success: true,
        message: "Payment verified and order confirmed.",
        payout_note: "Seller settlement is not initiated by this endpoint. Razorpay Route and approved linked-account configuration are required for marketplace payouts."
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } catch (error) { next(error); }
});

router.get("/mine/buying", authRequired, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT o.*,l.title,l.image_url,u.name AS seller_name
       FROM orders o JOIN listings l ON l.id=o.listing_id
       JOIN users u ON u.id=o.seller_id
       WHERE o.buyer_id=$1 ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json({ orders: result.rows });
  } catch (error) { next(error); }
});

router.get("/mine/selling", authRequired, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT o.*,l.title,l.image_url,u.name AS buyer_name
       FROM orders o JOIN listings l ON l.id=o.listing_id
       JOIN users u ON u.id=o.buyer_id
       WHERE o.seller_id=$1 ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json({ orders: result.rows });
  } catch (error) { next(error); }
});

router.patch("/:id/status", authRequired, async (req, res, next) => {
  try {
    const allowed = ["processing", "shipped", "delivered", "cancelled"];
    const { status, tracking_number = null } = req.body;
    if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid order status." });

    const result = await pool.query(
      `UPDATE orders SET status=$3,tracking_number=COALESCE($4,tracking_number),updated_at=NOW()
       WHERE id=$1 AND seller_id=$2 AND payment_status='paid'
       AND status NOT IN ('cancelled','refunded') RETURNING *`,
      [req.params.id, req.user.id, status, tracking_number]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Paid order not found or status cannot be changed." });
    res.json({ order: result.rows[0] });
  } catch (error) { next(error); }
});

module.exports = router;