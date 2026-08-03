# Lemino Pizza — Menu Backend + Admin Panel

This gives your digital menu a real backend so you can edit items, prices, and
**upload/replace photos** for each dish — no code editing needed.

## What's inside
```
lemino-backend/
├── server.js          → Express backend (menu API + photo upload)
├── package.json
├── data/
│   └── menu.json       → your menu data (13 categories, 111 items, seeded from your file)
├── public/
│   ├── index.html       → the customer-facing menu (now loads data live from the backend)
│   ├── admin.html        → the admin panel — edit items & upload photos here
│   ├── qr.html            → generates a downloadable QR code for your live menu URL
│   └── uploads/            → uploaded photos are stored here automatically
```

## How to run it

1. Install [Node.js](https://nodejs.org) (v18 or newer) if you don't have it.
2. Open a terminal in this `lemino-backend` folder and run:
   ```bash
   npm install
   npm start
   ```
3. You'll see:
   ```
   Lemino Pizza backend running at http://localhost:4000
   Customer menu:  http://localhost:4000/
   Admin panel:    http://localhost:4000/admin.html
   ```
4. Open **http://localhost:4000/admin.html** to edit the menu.
   Open **http://localhost:4000/** to see the live customer menu — it updates
   automatically from whatever you save in the admin panel (just refresh the page).

## What you can do in the admin panel
- Edit any item's **name, size, price, description** — click "Save" on that row.
- Click **Upload** next to any item to add or replace its **photo**. It's saved
  to the backend and shows up on the live menu immediately.
- **Add new items** to a category using the bottom row of each table.
- **Delete items or whole categories**.
- **Add a new category** with the button at the top.
- Click **"🎨 Colour Theme"** to change the site's colours (background, gold
  accents, text colours, etc.) using simple colour pickers — no code needed.
  Click "Save Theme" and refresh the live menu to see it.
- Click **"🧾 Orders"** to see every order customers place — dine-in orders show
  the table number, delivery orders show the address and/or a live-location map
  link. Mark orders as Preparing/Done, or delete old ones. A red badge shows how
  many new orders are waiting.

## How customer ordering works
On the live menu, when a customer taps the cart and hits **"Send Order on
WhatsApp"**:
1. They choose **Dine-in** (enter their table number) or **Delivery** (type an
   address and/or tap "Share My Live Location" to send their GPS location).
2. The order is saved to the backend — it appears instantly in the admin
   panel's **Orders** tab.
3. WhatsApp opens with the full order, table number or delivery
   location/address, pre-filled — the customer just hits send.

## Table QR codes
Once your menu is live (see deployment below), open **`/qr.html`** (linked from the
top of the admin panel), paste in your live menu URL, and download a printable
QR code. Print it and put it on your tables — customers scan it and land
straight on your live, photo-enabled menu.

## Photo uploads — Cloudinary setup (do this once, important!)
Photos now upload to **Cloudinary** (a free image-hosting service) instead of
this server's own disk. This means photos will **never disappear**, even when
Render restarts the server — which fixes the "my uploaded photo keeps
vanishing" issue.

You need to do this **once**:

1. Go to [cloudinary.com](https://cloudinary.com) and sign up for a free account.
2. On your Cloudinary Dashboard, you'll see three values: **Cloud Name**, **API Key**, **API Secret**.
3. In your Render dashboard → your web service → **Environment** tab → add these three environment variables:
   - `CLOUDINARY_CLOUD_NAME` → your Cloud Name
   - `CLOUDINARY_API_KEY` → your API Key
   - `CLOUDINARY_API_SECRET` → your API Secret
4. Save — Render will automatically restart the service with these values.
5. Try uploading a photo from the admin panel — it should work and stay
   permanently, even after future restarts.

Until these 3 environment variables are set, photo uploads will show an error
(item text edits, prices, etc. still work fine — only photo upload needs this).

## Deploying it live (so it's not just on your computer)
Right now this only runs on your own machine at `localhost`. To make it live for
customers, you'd deploy it to a host like Render, Railway, or a VPS.

**Photos are safe now (via Cloudinary), but text data still isn't.** Item
names/prices/descriptions (`data/menu.json`), colours (`data/theme.json`), and
orders (`data/orders.json`) are still stored on the server's own disk — on
Render's Free tier, these still reset on restart. If you want *everything*
(not just photos) to survive restarts permanently, either:
- upgrade to Render's Starter plan (~$7/month) and attach a persistent disk, or
- ask me to move this data to a small free database instead (e.g. a free
  Postgres or MongoDB Atlas instance) — a bit more setup, but keeps it free.

I'm happy to help with either — just let me know.

## Notes
- Photos accepted: JPG, PNG, WEBP, GIF, up to 5MB each.
- The old hardcoded menu array is still in `index.html` (commented out) as a backup —
  it's no longer used since the page now loads from `/api/menu`.
- No database setup needed — menu data lives in `data/menu.json`, which the
  backend reads/writes automatically. Back this file up occasionally.
