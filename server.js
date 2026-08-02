const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 4000;

const DATA_FILE = path.join(__dirname, 'data', 'menu.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public'))); // serves index.html + admin.html

// ---------- helpers ----------
function readMenu() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function writeMenu(menu) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(menu, null, 2));
}
function slugify(str) {
  return String(str).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || crypto.randomBytes(3).toString('hex');
}

// ---------- image upload (multer) ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const unique = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
    cb(null, unique + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ok = /\.(jpe?g|png|webp|gif)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only jpg, png, webp, gif images allowed'), ok);
  }
});

// ================= API ROUTES =================

// GET full menu (used by the public frontend)
app.get('/api/menu', (req, res) => {
  res.json(readMenu());
});

// ---- Categories ----

// Add a category
app.post('/api/categories', (req, res) => {
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
app.put('/api/categories/:catId', (req, res) => {
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
app.delete('/api/categories/:catId', (req, res) => {
  let menu = readMenu();
  const exists = menu.some(c => c.id === req.params.catId);
  if (!exists) return res.status(404).json({ error: 'category not found' });
  menu = menu.filter(c => c.id !== req.params.catId);
  writeMenu(menu);
  res.json({ ok: true });
});

// ---- Items ----

// Add an item to a category
app.post('/api/categories/:catId/items', (req, res) => {
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
app.put('/api/categories/:catId/items/:itemId', (req, res) => {
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
app.delete('/api/categories/:catId/items/:itemId', (req, res) => {
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
app.post('/api/categories/:catId/items/:itemId/photo', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no photo uploaded' });
  const menu = readMenu();
  const cat = menu.find(c => c.id === req.params.catId);
  if (!cat) return res.status(404).json({ error: 'category not found' });
  const item = cat.items.find(i => i.id === req.params.itemId);
  if (!item) return res.status(404).json({ error: 'item not found' });

  // remove old uploaded image file if it was one of ours
  if (item.image && item.image.startsWith('/uploads/')) {
    const oldPath = path.join(__dirname, 'public', item.image);
    fs.unlink(oldPath, () => {});
  }

  item.image = '/uploads/' + req.file.filename;
  writeMenu(menu);
  res.json(item);
});

// Simple health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Lemino Pizza backend running at http://localhost:${PORT}`);
  console.log(`Customer menu:  http://localhost:${PORT}/`);
  console.log(`Admin panel:    http://localhost:${PORT}/admin.html`);
});
