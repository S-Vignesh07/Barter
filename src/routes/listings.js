
const express = require("express");
const pool = require("../db/pool");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

// GET: Fetch active listings with search and filters
router.get("/", async (req, res, next) => {
  try {
    const { q = "", category = "", city = "", type = "" } = req.query;

    const result = await pool.query(
      `SELECT
          l.id,
          l.owner_id,
          l.title,
          l.description,
          l.category,
          l.item_condition AS condition,
          l.city,
          l.listing_type,
          l.price,
          l.image_url,
          l.quantity,
          l.status,
          l.open_to_offers,
          l.looking_for,
          l.created_at,
          u.name AS owner_name
       FROM listings l
       JOIN users u ON u.id = l.owner_id
       WHERE l.status = 'active'
         AND l.quantity > 0
         AND ($1 = '' OR l.title ILIKE '%' || $1 || '%'
              OR l.description ILIKE '%' || $1 || '%')
         AND ($2 = '' OR l.category = $2)
         AND ($3 = '' OR l.city ILIKE '%' || $3 || '%')
         AND ($4 = '' OR $4 = 'all'
              OR l.listing_type = $4 OR l.listing_type = 'both')
       ORDER BY l.created_at DESC`,
      [q, category, city, type]
    );

    res.json({ listings: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET: Fetch current user's listings
router.get("/mine", authRequired, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM listings
       WHERE owner_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({ listings: result.rows });
  } catch (error) {
    next(error);
  }
});

// POST: Create a listing
router.post("/", authRequired, async (req, res, next) => {
  try {
    const {
      title,
      description = "",
      category,
      condition = "Good",
      city = "",
      listing_type = "sell",
      price = null,
      image_url = "",
      looking_for = "",
      quantity = 1,
      open_to_offers = false
    } = req.body;

    if (
      typeof title !== "string" ||
      !title.trim() ||
      typeof category !== "string" ||
      !category.trim()
    ) {
      return res.status(400).json({
        error: "Product name and category are required."
      });
    }

    if (!["sell", "swap", "both"].includes(listing_type)) {
      return res.status(400).json({
        error: "Listing type must be sell, swap or both."
      });
    }

    let finalPrice = null;

    if (listing_type !== "swap") {
      if (
        price === null ||
        price === "" ||
        !Number.isFinite(Number(price)) ||
        Number(price) < 0
      ) {
        return res.status(400).json({
          error: "Enter a valid price for an item offered for sale."
        });
      }

      finalPrice = Number(price);
    }

    const qty = Number(quantity);

    if (!Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({
        error: "Quantity must be at least 1."
      });
    }

    const result = await pool.query(
      `INSERT INTO listings (
          owner_id,
          title,
          description,
          category,
          item_condition,
          city,
          listing_type,
          price,
          image_url,
          looking_for,
          quantity,
          open_to_offers,
          status
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active')
       RETURNING *`,
      [
        req.user.id,
        title.trim(),
        description,
        category.trim(),
        condition,
        city,
        listing_type,
        finalPrice,
        image_url || null,
        looking_for || null,
        qty,
        Boolean(open_to_offers)
      ]
    );

    res.status(201).json({ listing: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// PATCH: Update a listing owned by the current user
router.patch("/:id", authRequired, async (req, res, next) => {
  try {
    const {
      title,
      description,
      category,
      condition,
      city,
      listing_type,
      price,
      image_url,
      looking_for,
      quantity,
      status,
      open_to_offers
    } = req.body;

    if (
      listing_type !== undefined &&
      !["sell", "swap", "both"].includes(listing_type)
    ) {
      return res.status(400).json({
        error: "Invalid listing type."
      });
    }

    if (
      status !== undefined &&
      !["active", "sold", "paused", "removed"].includes(status)
    ) {
      return res.status(400).json({
        error: "Invalid listing status."
      });
    }

    if (
      price !== undefined &&
      price !== null &&
      price !== "" &&
      (!Number.isFinite(Number(price)) || Number(price) < 0)
    ) {
      return res.status(400).json({
        error: "Price must be a valid non-negative number."
      });
    }

    if (
      quantity !== undefined &&
      (!Number.isInteger(Number(quantity)) || Number(quantity) < 0)
    ) {
      return res.status(400).json({
        error: "Quantity must be a non-negative integer."
      });
    }

    const result = await pool.query(
      `UPDATE listings SET
          title = COALESCE($3, title),
          description = COALESCE($4, description),
          category = COALESCE($5, category),
          item_condition = COALESCE($6, item_condition),
          city = COALESCE($7, city),
          listing_type = COALESCE($8, listing_type),
          price = CASE WHEN $9 THEN $10 ELSE price END,
          image_url = COALESCE($11, image_url),
          looking_for = COALESCE($12, looking_for),
          quantity = COALESCE($13, quantity),
          status = COALESCE($14, status),
          open_to_offers = COALESCE($15, open_to_offers),
          updated_at = NOW()
       WHERE id = $1 AND owner_id = $2
       RETURNING *`,
      [
        req.params.id,
        req.user.id,
        title ?? null,
        description ?? null,
        category ?? null,
        condition ?? null,
        city ?? null,
        listing_type ?? null,
        price !== undefined && price !== null && price !== "",
        price === "" || price === null ? null : price,
        image_url ?? null,
        looking_for ?? null,
        quantity ?? null,
        status ?? null,
        open_to_offers ?? null
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        error: "Listing not found or you do not own it."
      });
    }

    res.json({ listing: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE: Soft-remove a listing without deleting its record
router.delete("/:id", authRequired, async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE listings
       SET status = 'removed', updated_at = NOW()
       WHERE id = $1
         AND owner_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM orders
           WHERE listing_id = $1
             AND status NOT IN ('cancelled', 'refunded')
         )`,
      [req.params.id, req.user.id]
    );

    if (!result.rowCount) {
      return res.status(409).json({
        error: "Listing not found, not yours, or linked to an active order."
      });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
