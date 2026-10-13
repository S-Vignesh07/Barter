# Barter — Ecommerce Marketplace Starter

This project is a local-development starter using HTML/CSS/JavaScript, Node.js/Express and PostgreSQL. It includes user registration/login, product listings, seller's own listings, wishlist, order creation, Razorpay checkout scaffolding, buyer/seller order lists, basic listing-related messaging endpoints and reviews.

## Requirements
- Node.js 18+
- PostgreSQL
- Razorpay test account for checkout testing

## Setup on Windows
1. Extract this folder to `D:\Barter` (back up your existing folder first).
2. Open the folder in VS Code and open a terminal in that folder.
3. Create a database named `barter_db` in pgAdmin 4.
4. Open pgAdmin Query Tool connected to `barter_db`; run all of `sql/schema.sql`.
5. Copy `.env.example` to a new file named `.env`.
6. Set `DB_PASSWORD` to your PostgreSQL password and set a long random `JWT_SECRET`.
7. Add Razorpay **test mode** `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to `.env` if you want to test checkout.
8. Run:
   ```bash
   npm install
   npm run dev
   ```
9. Open http://localhost:3000 and register an account.

## Important notes
- Do not upload `.env` to GitHub or share secret keys.
- Razorpay checkout is only enabled when test/live keys are configured. Start with test mode.
- This starter creates and verifies a standard Razorpay order. It does **not** yet transfer money directly to sellers. Direct marketplace payouts require Razorpay Route, linked-account onboarding, approval, and additional server-side transfer/settlement handling.
- Bank details are deliberately not collected or stored by this starter.
- Seller chat is a basic API scaffold, not real-time chat. Use authenticated APIs; production chat needs better conversation permissions, polling or WebSockets, unread counts and notifications.
- Production ecommerce requires additional work: webhook signature verification, robust payment reconciliation, idempotency, refund/cancellation workflows, shipping integrations, image upload/storage, address management, admin moderation, fraud prevention, privacy/legal policies, and automated tests.
- The frontend uses an image URL field, not file uploads.
- Do not use real customer payments until the integration is reviewed and tested end-to-end.
