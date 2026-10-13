const $ = (selector) => document.querySelector(selector);
const state = {
  token: localStorage.getItem("barter_token"),
  user: JSON.parse(localStorage.getItem("barter_user") || "null"),
  mode: "register"
};
let isPublishing = false;

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, ch => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[ch]));

async function api(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `Request failed (${response.status})`);
  return data;
}

function message(element, text, error = false) {
  if (!element) return;
  element.textContent = text;
  element.style.color = error ? "#b34235" : "";
}
function openAuth(mode = "register") {
  setMode(mode);
  $("#authModal")?.classList.remove("hidden");
}
function closeAuth() { $("#authModal")?.classList.add("hidden"); }
function setMode(mode) {
  state.mode = mode;
  if ($("#authTitle")) $("#authTitle").textContent = mode === "register" ? "Join the community." : "Welcome back.";
  $("#nameField")?.classList.toggle("hidden", mode === "login");
  const name = $("#authForm [name=name]");
  if (name) name.required = mode === "register";
  if ($("#authSubmit")) $("#authSubmit").textContent = mode === "register" ? "Create account" : "Log in";
  document.querySelectorAll(".auth-tabs button").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  message($("#authMessage"), "");
}
$("#loginOpen")?.addEventListener("click", () => openAuth("login"));
$("#modalClose")?.addEventListener("click", closeAuth);
$("#authModal")?.addEventListener("click", e => { if (e.target === $("#authModal")) closeAuth(); });
document.querySelectorAll(".auth-tabs button").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));

function updateAccount() {
  const card = $("#accountCard");
  if (!card) return;
  if (!state.user) {
    card.innerHTML = `<h3>Your account</h3><p class="muted">Log in to manage listings, orders and your wishlist.</p><button class="btn dark" id="accountLogin">Log in / Register</button>`;
    $("#accountLogin")?.addEventListener("click", () => openAuth("login"));
    if ($("#loginOpen")) $("#loginOpen").textContent = "Log in";
    return;
  }
  card.innerHTML = `
    <h3>Hello, ${escapeHtml(state.user.name)}!</h3>
    <p class="muted">${escapeHtml(state.user.email)} · ${escapeHtml(state.user.city || "Community member")}</p>
    <button class="btn outline" id="wishlistBtn">View wishlist</button>
    <button class="btn outline" id="logoutBtn">Log out</button>
    <div id="accountExtra"></div>`;
  if ($("#loginOpen")) $("#loginOpen").textContent = state.user.name.split(" ")[0];
  $("#logoutBtn")?.addEventListener("click", () => {
    state.token = null; state.user = null;
    localStorage.removeItem("barter_token"); localStorage.removeItem("barter_user");
    updateAccount(); renderListings();
  });
  $("#wishlistBtn")?.addEventListener("click", async () => {
    try {
      const d = await api("/api/wishlist");
      $("#accountExtra").innerHTML = (d.listings || []).map(l =>
        `<div class="dashboard-item">${escapeHtml(l.title)} <button class="btn outline" data-unwish="${l.id}">Remove</button></div>`
      ).join("") || "<p>Your wishlist is empty.</p>";
      document.querySelectorAll("[data-unwish]").forEach(b => b.addEventListener("click", async () => {
        await api(`/api/wishlist/${b.dataset.unwish}`, { method: "DELETE" }); $("#wishlistBtn").click();
      }));
    } catch (e) { alert(e.message); }
  });
}

async function renderListings() {
  const params = new URLSearchParams();
  for (const [key, id] of [["q","search"],["category","category"],["city","city"],["type","type"]]) {
    const field = $("#" + id); const value = field?.value?.trim() || "";
    if (value) params.set(key, value);
  }
  const grid = $("#listingGrid");
  if (!grid) return;
  grid.innerHTML = '<div class="empty-state">Finding good things…</div>';
  try {
    const data = await api(`/api/listings?${params}`);
    const listings = Array.isArray(data.listings) ? data.listings : [];
    if (!listings.length) {
      grid.innerHTML = '<div class="empty-state">No listings found. Be the first to list an item.</div>'; return;
    }
    grid.innerHTML = listings.map(l => `
      <article class="listing-card">
        <div class="listing-image">${l.image_url ? `<img src="${escapeHtml(l.image_url)}" alt="${escapeHtml(l.title)}" loading="lazy" onerror="this.parentElement.textContent='✳'">` : "✳"}</div>
        <div class="listing-content">
          <div class="tag-row"><span class="tag">${escapeHtml(l.category)}</span><span class="tag orange">${escapeHtml(l.listing_type === "both" ? "SELL OR SWAP" : l.listing_type.toUpperCase())}</span></div>
          <h3>${escapeHtml(l.title)}</h3><p>${escapeHtml(l.description)}</p>
          <div class="listing-meta"><span class="price">${l.price != null ? `₹${Number(l.price).toLocaleString("en-IN")}` : "Swap only"}</span><span>⌖ ${escapeHtml(l.city)}</span></div>
          <p>Listed by ${escapeHtml(l.owner_name || "Community member")}</p>
          <div class="listing-actions">
            <button class="btn outline" data-wish="${l.id}">♡ Save</button>
            <button class="btn dark" data-chat="${l.id}" data-seller="${l.seller_id}">Contact seller</button>
            ${l.listing_type !== "swap" && l.price != null && l.seller_id !== state.user?.id ? `<button class="btn dark" data-buy="${l.id}">Buy now</button>` : ""}
          </div>
        </div>
      </article>`).join("");

    grid.querySelectorAll("[data-wish]").forEach(b => b.addEventListener("click", async () => {
      if (!state.token) return openAuth("login");
      try { await api(`/api/wishlist/${b.dataset.wish}`, { method: "POST" }); b.textContent = "♥ Saved"; }
      catch (e) { alert(e.message); }
    }));
    grid.querySelectorAll("[data-chat]").forEach(b => b.addEventListener("click", () => {
      if (!state.token) return openAuth("login");
      const text = prompt("Write a message to the seller:");
      if (text?.trim()) api(`/api/chat/${b.dataset.chat}`, {
        method: "POST", body: JSON.stringify({ body: text.trim() })
      }).then(() => alert("Message sent. Seller can reply through the conversation API.")).catch(e => alert(e.message));
    }));
    grid.querySelectorAll("[data-buy]").forEach(b => b.addEventListener("click", () => buyListing(b.dataset.buy)));
  } catch (e) {
    grid.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}<br>Check that the backend and database are running.</div>`;
  }
}

async function buyListing(listingId) {
  if (!state.token) return openAuth("login");
  const quantityText = prompt("Quantity to buy:", "1");
  if (quantityText === null) return;
  const quantity = Number(quantityText);
  if (!Number.isInteger(quantity) || quantity < 1) return alert("Enter a valid quantity.");
  const address = prompt("Enter full delivery address:");
  if (!address?.trim()) return alert("Delivery address is required.");
  try {
    const data = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({ listing_id: listingId, quantity, delivery_address: address.trim() })
    });
    if (!data.checkout) {
      alert(data.message || "Order created, but Razorpay is not configured in .env.");
      return;
    }
    if (!window.Razorpay) return alert("Razorpay checkout library did not load. Check your internet connection.");
    const checkout = new Razorpay({
      key: data.checkout.key_id,
      order_id: data.checkout.razorpay_order_id,
      amount: data.checkout.amount,
      currency: data.checkout.currency,
      name: "Barter Marketplace",
      description: "Marketplace purchase",
      handler: async function (response) {
        try {
          await api(`/api/orders/${data.order.id}/verify-payment`, {
            method: "POST",
            body: JSON.stringify(response)
          });
          alert("Payment verified! Your order is confirmed.");
          loadOrders("buying");
          renderListings();
        } catch (e) { alert(`Payment verification needs attention: ${e.message}`); }
      },
      prefill: { name: state.user?.name || "", email: state.user?.email || "" },
      theme: { color: "#20251f" },
      modal: { ondismiss: () => alert("Checkout closed. If you completed payment, check My Purchases before trying again.") }
    });
    checkout.open();
  } catch (e) { alert(e.message); }
}

async function loadMyListings() {
  if (!state.token) return openAuth("login");
  try {
    const data = await api("/api/listings/mine");
    const target = $("#myListings");
    target.innerHTML = (data.listings || []).map(l => `
      <div class="dashboard-item">
        <strong>${escapeHtml(l.title)}</strong>
        <span>${escapeHtml(l.status)} · Quantity: ${l.quantity} · ${l.price == null ? "Swap" : "₹" + l.price}</span><br>
        <button class="btn outline" data-pause="${l.id}" data-status="${l.status === "paused" ? "active" : "paused"}">${l.status === "paused" ? "Reactivate" : "Pause"}</button>
        <button class="btn outline" data-sold="${l.id}">Mark sold</button>
      </div>`).join("") || "<p class='muted'>You have not listed anything yet.</p>";
    target.querySelectorAll("[data-pause]").forEach(b => b.addEventListener("click", async () => {
      try { await api(`/api/listings/${b.dataset.pause}`, { method: "PATCH", body: JSON.stringify({ status: b.dataset.status }) }); loadMyListings(); renderListings(); }
      catch (e) { alert(e.message); }
    }));
    target.querySelectorAll("[data-sold]").forEach(b => b.addEventListener("click", async () => {
      try { await api(`/api/listings/${b.dataset.sold}`, { method: "PATCH", body: JSON.stringify({ status: "sold", quantity: 0 }) }); loadMyListings(); renderListings(); }
      catch (e) { alert(e.message); }
    }));
  } catch (e) { alert(e.message); }
}

async function loadOrders(which) {
  if (!state.token) return openAuth("login");
  const target = which === "buying" ? $("#myPurchases") : $("#mySales");
  try {
    const data = await api(`/api/orders/mine/${which}`);
    target.innerHTML = (data.orders || []).map(o => `
      <div class="dashboard-item">
        <strong>${escapeHtml(o.title)}</strong>
        <span>₹${Number(o.total_amount).toLocaleString("en-IN")} · ${escapeHtml(o.status)} · Payment: ${escapeHtml(o.payment_status)}</span>
        <p class="muted">${which === "buying" ? "Seller" : "Buyer"}: ${escapeHtml(which === "buying" ? o.seller_name : o.buyer_name)}</p>
        ${which === "selling" && o.payment_status === "paid" ? `<select data-order-status="${o.id}"><option value="">Update order status</option><option value="processing">Processing</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option></select><input data-tracking="${o.id}" placeholder="Tracking number (optional)"><button class="btn outline" data-update-order="${o.id}">Update</button>` : ""}
      </div>`).join("") || "<p class='muted'>No orders yet.</p>";
    target.querySelectorAll("[data-update-order]").forEach(b => b.addEventListener("click", async () => {
      const status = target.querySelector(`[data-order-status="${b.dataset.updateOrder}"]`).value;
      const tracking_number = target.querySelector(`[data-tracking="${b.dataset.updateOrder}"]`).value;
      if (!status) return alert("Select a status.");
      try {
        await api(`/api/orders/${b.dataset.updateOrder}/status`, { method: "PATCH", body: JSON.stringify({ status, tracking_number }) });
        alert("Order updated."); loadOrders("selling");
      } catch (e) { alert(e.message); }
    }));
  } catch (e) { alert(e.message); }
}

const listingForm = $("#listingForm");
if (listingForm) {
  listingForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (isPublishing) return;
    if (!state.token) return openAuth("login");
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    isPublishing = true;
    if (submit) { submit.disabled = true; submit.textContent = "Publishing…"; }
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    body.open_to_offers = fd.has("open_to_offers");
    body.price = body.price === "" ? null : Number(body.price);
    body.quantity = Number(body.quantity || 1);
    try {
      await api("/api/listings", { method: "POST", body: JSON.stringify(body) });
      message($("#listingMessage"), "Listing published successfully!");
      form.reset();
      await renderListings();
      await loadMyListings();
    } catch (e) { message($("#listingMessage"), e.message, true); }
    finally {
      isPublishing = false;
      if (submit) { submit.disabled = false; submit.textContent = "Publish listing ↗"; }
    }
  });
}

$("#authForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const data = await api(`/api/auth/${state.mode}`, { method: "POST", body: JSON.stringify(body) });
    state.token = data.token; state.user = data.user;
    localStorage.setItem("barter_token", data.token);
    localStorage.setItem("barter_user", JSON.stringify(data.user));
    closeAuth(); updateAccount(); renderListings();
  } catch (e) { message($("#authMessage"), e.message, true); }
});

$("#searchBtn")?.addEventListener("click", renderListings);
$("#refreshBtn")?.addEventListener("click", renderListings);
$("#search")?.addEventListener("keydown", e => { if (e.key === "Enter") renderListings(); });
$("#myListingsBtn")?.addEventListener("click", loadMyListings);
$("#myPurchasesBtn")?.addEventListener("click", () => loadOrders("buying"));
$("#mySalesBtn")?.addEventListener("click", () => loadOrders("selling"));

async function boot() {
  if (state.token) {
    try {
      const data = await api("/api/auth/me");
      state.user = data.user;
      localStorage.setItem("barter_user", JSON.stringify(data.user));
    } catch {
      state.token = null; state.user = null;
      localStorage.removeItem("barter_token"); localStorage.removeItem("barter_user");
    }
  }
  updateAccount();
  renderListings();
}
boot();
