# Local Doc Reader Backend

Express API for local document upload, extraction, OCR, and table parsing. No AI services or API keys are used.

## Setup

```bash
cd backend
npm install
cp .env.example .env
```

## Run

```bash
npm run dev
```

API runs on `http://localhost:4000`.

## Endpoint

- `POST /upload` with multipart field `file`

Supported files: PDF, DOCX, TXT, CSV, XLS, XLSX, JPG, PNG.

## Production

Build the frontend first:

```bash
cd ../frontend
npm run build
```

Then run the backend in production mode:

```bash
cd ../backend
NODE_ENV=production npm start
```

Express will serve `frontend/dist` and the upload API from the same origin.
