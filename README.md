# National Irrigation Administration - Property Office Stock Management System

A responsive, mobile-first inventory application for recording, adjusting, and tracking office property and supplies.

## Features
- **Authentication**: Pre-configured admin login (`property` / `propertyoffice`).
- **Realtime Database**: Powered by Firebase Realtime Database.
- **Stock Tracking**: Add and reduce quantities without deleting zero-quantity items.
- **Datalist Suggestions**: Quick autocomplete for previously registered items.
- **Right-Click & Long-Press Menu**: Inspect historical addition/reduction logs per item with exact dates.
- **Category Management**: Create, view, and delete categories on the fly.
- **Audit Logs**: Global chronological record of all stock transactions.

## Local Development
To run the project locally using the built-in development server:
```bash
node dev-server.js
```
Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment to Vercel
This repository is configured for zero-config Vercel deployment via `vercel.json` and `.vercelignore`:
1. Connect your GitHub repository (`PRDSTOCK`) to Vercel.
2. In the Vercel project configuration:
   - **Framework Preset**: Other
   - **Root Directory**: `./` (default)
   - **Build Command**: None / empty
   - **Output Directory**: None / empty
3. Click **Deploy**. Vercel will serve `index.html`, `css/styles.css`, and `js/app.js` directly through its global CDN.

## Deployment to GitHub Pages
1. Push to GitHub:
   ```bash
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
2. Enable GitHub Pages in your repository settings under **Settings > Pages > Deploy from a branch** (`main` / root).
