# Local Doc Reader

A lightweight mobile-friendly PWA for opening common document files through a local Node.js server. There are no AI features, no chat, no summaries, and no external API keys.

## Features

- Mobile-first React + Vite frontend
- Node.js + Express backend
- Single `POST /upload` endpoint
- Local extraction for PDF, DOCX, TXT, JPG, PNG, CSV, XLS, and XLSX
- OCR for images with `tesseract.js`
- CSV and Excel table preview
- 10 MB upload limit
- Uploaded files are deleted after processing
- PWA manifest and service worker for Android Chrome install support

## Requirements

- Node.js 20 or newer

## Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

The backend runs at `http://localhost:4000`.

## Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`.

For Android Chrome, connect the phone to the same network and open the Vite network URL printed in the terminal, such as `http://192.168.x.x:5173`.

In Android Chrome, open the menu and choose **Add to Home screen** or **Install app**. The app includes a manifest, service worker, and PNG app icons for standalone installation.

## Production Build

```bash
cd frontend
npm run build
```

```bash
cd backend
NODE_ENV=production npm start
```

In production mode, Express serves the built frontend from `frontend/dist` and keeps the upload API on the same origin. You can also serve `frontend/dist` from a separate static host; if you do, set `FRONTEND_ORIGIN` in `backend/.env` to the frontend URL and `VITE_API_URL` in `frontend/.env` to the backend URL before building.

If a browser still shows a stale blank page after local development changes, unregister the old service worker from Chrome DevTools, or reload once after this update. Dev mode now automatically unregisters the service worker and clears its cache.

## Free Deploy On Render

This repo includes `render.yaml` for a free Render web service. Render builds the React app, installs the backend, and serves everything from one Node service.

Use these commands before pushing:

```bash
npm run render-build
npm start
```

Then open `http://localhost:4000` to test the production bundle locally.

## API

`POST /upload`

Multipart form field:

```text
file
```

Response for text-like files:

```json
{
  "kind": "text",
  "fileName": "example.pdf",
  "text": "Extracted content...",
  "stats": {
    "characters": 1234,
    "lines": 42
  }
}
```

Response for CSV/Excel:

```json
{
  "kind": "table",
  "fileName": "sheet.xlsx",
  "table": {
    "sheetName": "Sheet1",
    "truncated": false,
    "rows": [["Name", "Value"], ["A", "1"]]
  },
  "stats": {
    "rows": 2,
    "columns": 2,
    "truncated": false
  }
}
```
