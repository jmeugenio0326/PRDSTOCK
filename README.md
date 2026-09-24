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

## Setup & Deployment to GitHub Pages
1. Initialize Git repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit - NIA Inventory System"
   ```
2. Push to GitHub:
   ```bash
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
3. Enable GitHub Pages in your repository settings under Settings > Pages > Deploy from a branch (`main` / root).
