const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const cloudinary = require('cloudinary').v2;

const app = express();
const PORT = process.env.PORT || 4000;

// ---------- Cloudinary config ----------
// Set these in Render → your service → Environment tab (or a local .env)
const CLOUDINARY_READY = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
if (CLOUDINARY_READY) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
} else {
  console.warn('⚠️  Cloudinary env vars not set — photo uploads will fail until CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are set.');
}

const DATA_FILE = path.join(__dirname, 'data', 'menu.json');
const THEME_FILE = path.join(__dirname, 'data', 'theme.json');
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public'))); // serves index.html + admin.html

// ---------- Admin password protection ----------
// Set ADMIN_PASSWORD in Render → your service → Environment tab.
// admin.html sends it back in the "x-admin-password" header on every request.
if (!process.env.ADMIN_PASSWORD) {
  console.warn('⚠️  ADMIN_PASSWORD not set — the admin panel is currently UNPROTECTED. Set it in your environment variables.');
}
function requireAdminAuth(req, res, next) {
  const required = process.env.ADMIN_PASSWORD;
  if (!required) return next(); // no password configured yet — allow (with the warning above)
  const provided = req.headers['x-admin-password'];
  if (provided && provided === required) return next();
  return res.status(401).json({ error: 'Incorrect or missing admin password' });
}

// Lets admin.html check a password without needing any other data back
app.get('/api/admin/verify', requireAdminAuth, (req, res) => {
  res.json({ ok: true });
});

// ---------- helpers ----------
function readMenu() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function writeMenu(menu) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(menu, null, 2));
}
function readTheme() {
  return JSON.parse(fs.readFileSync(THEME_FILE, 'utf8'));
}
function writeTheme(theme) {
  fs.writeFileSync(THEME_FILE, JSON.stringify(theme, null, 2));
}
function readOrders() {
  if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]');
  return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
}
function writeOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}
function slugify(str) {
  return String(str).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || crypto.randomBytes(3).toString('hex');
}

// ---------- image upload (multer → memory → Cloudinary) ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ok = /\.(jpe?g|png|webp|gif)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only jpg, png, webp, gif images allowed'), ok);
  }
});

function bufferToStream(buffer) {
  const readable = new Readable();
  readable.push(buffer);
  readable.push(null);
  return readable;
}

function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'lemino-pizza-menu' },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    bufferToStream(buffer).pipe(stream);
  });
}

// ================= API ROUTES =================

// GET full menu (used by the public frontend)
app.get('/api/menu', (req, res) => {
  res.json(readMenu());
});

// ---- Theme (site colors) ----
app.get('/api/theme', (req, res) => {
  res.json(readTheme());
});

app.put('/api/theme', requireAdminAuth, (req, res) => {
  const current = readTheme();
  const updated = { ...current, ...req.body };
  writeTheme(updated);
  res.json(updated);
});

// ---- Orders ----

const PHONE_PATTERN = /^[6-9]\d{9}$/;

// Simple in-memory rate limit: max 5 orders per phone number per 10 minutes.
// (Resets if the server restarts — fine for spam prevention, not meant to be perfectly precise.)
const orderRateLimit = new Map(); // phone -> [timestamps]
function isRateLimited(phone) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const timestamps = (orderRateLimit.get(phone) || []).filter(t => now - t < windowMs);
  timestamps.push(now);
  orderRateLimit.set(phone, timestamps);
  return timestamps.length > 5;
}

// Create a new order (called by the customer-facing menu) — stays PUBLIC, no auth
app.post('/api/orders', (req, res) => {
  const { orderType, tableNumber, address, location, customerName, customerPhone, items, total } = req.body;

  if (!orderType || !['dinein', 'delivery'].includes(orderType)) {
    return res.status(400).json({ error: 'orderType must be dinein or delivery' });
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return res.status(400).json({ error: 'items must be a non-empty list (max 50)' });
  }
  if (!PHONE_PATTERN.test(customerPhone || '')) {
    return res.status(400).json({ error: 'A valid 10-digit mobile number is required' });
  }
  if (orderType === 'dinein' && !/^\d{1,4}$/.test(String(tableNumber || ''))) {
    return res.status(400).json({ error: 'A valid table number is required' });
  }
  if (customerName && customerName.length > 60) {
    return res.status(400).json({ error: 'Name is too long' });
  }
  if (address && address.length > 200) {
    return res.status(400).json({ error: 'Address is too long' });
  }
  if (isRateLimited(customerPhone)) {
    return res.status(429).json({ error: 'Too many orders from this number recently. Please wait a few minutes and try again, or call the restaurant directly.' });
  }

  const orders = readOrders();

  // Recompute prices from the authoritative menu — never trust price from the client.
  const menu = readMenu();
  function findMenuItem(itemId) {
    for (const cat of menu) {
      const it = cat.items.find(i => i.id === itemId);
      if (it) return it;
    }
    return null;
  }

  const verifiedItems = items.slice(0, 50).map(it => {
    const menuItem = findMenuItem(it.id);
    const qty = Math.max(1, Math.min(50, Number(it.qty) || 1));
    if (menuItem) {
      // trusted: real price/name/size from menu.json, client cannot alter these
      return { name: menuItem.name, size: menuItem.size || '', qty, price: menuItem.price };
    }
    // fallback (e.g. item was deleted from the menu after being added to cart) — price locked to 0, flagged
    return { name: String(it.name || 'Unknown item').slice(0, 100), size: String(it.size || '').slice(0, 30), qty, price: 0, unverified: true };
  });
  const verifiedTotal = verifiedItems.reduce((sum, it) => sum + it.qty * it.price, 0);

  const order = {
    id: Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex'),
    orderType,
    tableNumber: orderType === 'dinein' ? String(tableNumber).slice(0, 4) : '',
    address: orderType === 'delivery' ? String(address || '').slice(0, 200) : '',
    location: location || null,
    customerName: String(customerName || '').slice(0, 60),
    customerPhone,
    items: verifiedItems,
    total: verifiedTotal,
    status: 'new',
    createdAt: new Date().toISOString()
  };
  orders.unshift(order); // newest first
  writeOrders(orders);
  res.status(201).json(order);
});

// List all orders (used by the admin panel) — protected, contains customer phone/address
app.get('/api/orders', requireAdminAuth, (req, res) => {
  res.json(readOrders());
});

// Update an order's status (e.g. new -> preparing -> done)
app.put('/api/orders/:orderId', requireAdminAuth, (req, res) => {
  const orders = readOrders();
  const order = orders.find(o => o.id === req.params.orderId);
  if (!order) return res.status(404).json({ error: 'order not found' });
  if (req.body.status) order.status = req.body.status;
  writeOrders(orders);
  res.json(order);
});

// Delete an order
app.delete('/api/orders/:orderId', requireAdminAuth, (req, res) => {
  let orders = readOrders();
  const exists = orders.some(o => o.id === req.params.orderId);
  if (!exists) return res.status(404).json({ error: 'order not found' });
  orders = orders.filter(o => o.id !== req.params.orderId);
  writeOrders(orders);
  res.json({ ok: true });
});

// ---- Categories ----

// Add a category
app.post('/api/categories', requireAdminAuth, (req, res) => {
  const { title, desc } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const menu = readMenu();
  let id = slugify(title);
  let n = 1;
  while (menu.some(c => c.id === id)) id = slugify(title) + '-' + (n++);
  const cat = { id, title, desc: desc || '', items: [] };
  menu.push(cat);
  writeMenu(menu);
  res.status(201).json(cat);
});

// Edit a category (title/desc)
app.put('/api/categories/:catId', requireAdminAuth, (req, res) => {
  const menu = readMenu();
  const cat = menu.find(c => c.id === req.params.catId);
  if (!cat) return res.status(404).json({ error: 'category not found' });
  const { title, desc } = req.body;
  if (title !== undefined) cat.title = title;
  if (desc !== undefined) cat.desc = desc;
  writeMenu(menu);
  res.json(cat);
});

// Delete a category
app.delete('/api/categories/:catId', requireAdminAuth, (req, res) => {
  let menu = readMenu();
  const exists = menu.some(c => c.id === req.params.catId);
  if (!exists) return res.status(404).json({ error: 'category not found' });
  menu = menu.filter(c => c.id !== req.params.catId);
  writeMenu(menu);
  res.json({ ok: true });
});

// ---- Items ----

// Add an item to a category
app.post('/api/categories/:catId/items', requireAdminAuth, (req, res) => {
  const menu = readMenu();
  const cat = menu.find(c => c.id === req.params.catId);
  if (!cat) return res.status(404).json({ error: 'category not found' });
  const { name, size, price, desc, image } = req.body;
  if (!name || price === undefined) return res.status(400).json({ error: 'name and price are required' });
  const item = {
    id: cat.id + '-' + crypto.randomBytes(4).toString('hex'),
    name, size: size || '', price: Number(price), desc: desc || '', image: image || ''
  };
  cat.items.push(item);
  writeMenu(menu);
  res.status(201).json(item);
});

// Edit an item (name/size/price/desc/image URL)
app.put('/api/categories/:catId/items/:itemId', requireAdminAuth, (req, res) => {
  const menu = readMenu();
  const cat = menu.find(c => c.id === req.params.catId);
  if (!cat) return res.status(404).json({ error: 'category not found' });
  const item = cat.items.find(i => i.id === req.params.itemId);
  if (!item) return res.status(404).json({ error: 'item not found' });
  const { name, size, price, desc, image } = req.body;
  if (name !== undefined) item.name = name;
  if (size !== undefined) item.size = size;
  if (price !== undefined) item.price = Number(price);
  if (desc !== undefined) item.desc = desc;
  if (image !== undefined) item.image = image;
  writeMenu(menu);
  res.json(item);
});

// Delete an item
app.delete('/api/categories/:catId/items/:itemId', requireAdminAuth, (req, res) => {
  const menu = readMenu();
  const cat = menu.find(c => c.id === req.params.catId);
  if (!cat) return res.status(404).json({ error: 'category not found' });
  const before = cat.items.length;
  cat.items = cat.items.filter(i => i.id !== req.params.itemId);
  if (cat.items.length === before) return res.status(404).json({ error: 'item not found' });
  writeMenu(menu);
  res.json({ ok: true });
});

// Upload / replace an item's photo. Field name: "photo"
app.post('/api/categories/:catId/items/:itemId/photo', requireAdminAuth, upload.single('photo'), async (req, res) => {
  if (!CLOUDINARY_READY) {
    return res.status(500).json({ error: 'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET as environment variables.' });
  }
  if (!req.file) return res.status(400).json({ error: 'no photo uploaded' });
  const menu = readMenu();
  const cat = menu.find(c => c.id === req.params.catId);
  if (!cat) return res.status(404).json({ error: 'category not found' });
  const item = cat.items.find(i => i.id === req.params.itemId);
  if (!item) return res.status(404).json({ error: 'item not found' });

  try {
    const result = await uploadToCloudinary(req.file.buffer);
    item.image = result.secure_url; // permanent, hosted URL — survives restarts/redeploys
    writeMenu(menu);
    res.json(item);
  } catch (err) {
    console.error('Cloudinary upload failed:', err);
    res.status(500).json({ error: 'Photo upload failed. Please try again.' });
  }
});

// Simple health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Lemino Pizza backend running at http://localhost:${PORT}`);
  console.log(`Customer menu:  http://localhost:${PORT}/`);
  console.log(`Admin panel:    http://localhost:${PORT}/admin.html`);
});
