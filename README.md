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

## Deploying it live (so it's not just on your computer)
Right now this only runs on your own machine at `localhost`. To make it live for
customers, you'd deploy it to a host like Render, Railway, or a VPS, which:
- keeps `server.js` running all the time,
- gives you a real domain/URL,
- and note: `data/menu.json` and `public/uploads/` should be on **persistent
  storage** (not something that resets on redeploy) so your edits and photos aren't lost.

I'm happy to help you set that up when you're ready — just tell me which host
you'd like to use (or ask me to recommend one for your budget).

## Notes
- Photos accepted: JPG, PNG, WEBP, GIF, up to 5MB each.
- The old hardcoded menu array is still in `index.html` (commented out) as a backup —
  it's no longer used since the page now loads from `/api/menu`.
- No database setup needed — menu data lives in `data/menu.json`, which the
  backend reads/writes automatically. Back this file up occasionally.
