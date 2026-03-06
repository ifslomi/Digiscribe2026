# DigiScribe 2026

DigiScribe 2026 is a full-stack transcription workflow platform.
It allows authenticated users to upload media and documents, organize files in folders, track processing status, and manage delivered transcriptions.

This README is written for beginners and new contributors. It explains what the project uses, how it is structured, and how to run it safely.

## 1. Project Overview

The application includes:

- A React frontend (`src/`) for user and admin interfaces
- An Express backend (`server/`) for uploads, file delivery, metadata, folders, admin actions, and pipeline hooks
- Firebase Authentication + Firestore for identity and metadata
- FTP storage for media/transcription file binaries

Common workflows:

- User uploads file in chunks
- Backend assembles and stores file on FTP
- Metadata is written to Firestore
- Admin manages statuses and transcription delivery
- Users stream/download files via authenticated API routes

## 2. Tech Stack

### Frontend

- React 19
- React Router 7
- Vite 7
- Tailwind CSS 4 + PostCSS
- Radix UI components

### Backend

- Node.js (ES Modules)
- Express 5
- Multer (multipart upload handling)
- Helmet + CORS + express-rate-limit (basic API hardening)
- Archiver (ZIP download generation)
- Nodemailer (quote email notifications)

### Data, Auth, and Storage

- Firebase Auth (token-based authentication)
- Firestore (files, folders, transcriptions, settings)
- FTP/FTPS via `basic-ftp` (binary file storage)

### Deployment

- Vercel (frontend + serverless API entry)
- Vite build output (`dist`)

## 3. Software and Accounts You Need

Minimum tools for local development:

- Node.js 20+ (recommended current LTS)
- npm 10+
- Git
- VS Code (recommended)

Optional/feature-specific tools:

- Python 3 and `pip` (used to install `yt-dlp` fallback via `postinstall`)
- FTP server access credentials
- Firebase project (client + admin credentials)
- SMTP provider account (for backend quote notification emails)
- EmailJS account (for frontend quote page integration)

## 4. High-Level Architecture

1. Frontend sends auth token in `Authorization: Bearer <idToken>`.
2. Backend validates Firebase token (`verifyAuth` / `verifyAdmin`).
3. Upload flow writes file data to FTP and metadata to Firestore.
4. File playback/download uses authenticated `/api/files/*` proxy with range support.
5. Admin endpoints manage users, statuses, and transcription outputs.

## 5. File Structure (Beginner Map)

```text
.
|-- api/
|   `-- index.js                 # Vercel serverless entry, exports Express app
|-- server/
|   |-- server.js                # Main Express app and API routes
|   |-- firebaseAdmin.js         # Firebase Admin SDK initialization
|   |-- middleware/
|   |   `-- authMiddleware.js    # verifyAuth / verifyAdmin
|   |-- routes/
|   |   |-- files.js             # File metadata + transcription attachment routes
|   |   |-- folders.js           # Folder CRUD and move logic
|   |   |-- pipeline.js          # External pipeline webhook/status routes
|   |   |-- transcriptions.js    # Transcription CRUD and delivery upload
|   |   `-- users.js             # Admin user management
|   `-- services/
|       |-- ftp.js               # FTP file operations
|       |-- ftpPathResolver.js   # Folder/file path computation
|       |-- ftpSync.js           # FTP-to-DB reconciliation helpers
|       `-- ytdlp.js             # URL media extraction helpers
|-- src/
|   |-- main.jsx                 # React app bootstrap
|   |-- App.jsx                  # Route composition
|   |-- firebase.js              # Firebase client SDK setup
|   |-- pages/                   # Page-level views (upload, dashboard, admin, etc.)
|   |-- components/              # Reusable UI and feature components
|   |-- contexts/                # App contexts (auth, shared state)
|   |-- hooks/                   # Custom hooks
|   |-- data/                    # Navigation/config/static data
|   `-- lib/                     # Utilities (URL handling, helpers)
|-- public/                      # Static assets served directly
|-- images/                      # Source image assets
|-- vite.config.js               # Frontend dev server + proxy setup
|-- vercel.json                  # Vercel function config (maxDuration, rewrites)
`-- package.json                 # Scripts and dependencies
```

## 6. Internal API Surface

Main backend groups:

- Upload routes: `/api/upload/chunk`, `/api/upload/complete`, `/api/upload/url`
- File routes: `/api/files/metadata`, `/api/files/bulk-*`, `/api/files/*path`
- Folder routes: `/api/folders/*`
- Transcription routes: `/api/transcriptions/*`
- Admin routes: `/api/admin/users*`, `/api/admin/settings`
- Pipeline routes: `/api/pipeline/status`, `/api/pipeline/webhook`
- Quote route: `/api/quote`

Authentication model:

- Most routes require Firebase ID token
- Admin actions require admin custom claims
- Pipeline routes can use either admin token or `x-pipeline-key`

## 7. External Services and APIs Used

### Firebase

- Firebase Client SDK (frontend auth/session)
- Firebase Admin SDK (token verification, admin user ops)
- Firestore API (metadata, folders, transcriptions, settings)

### FTP Server (FTPS)

- `basic-ftp` is used for upload, append, move/rename, delete, stream, and file-size checks
- Binary data is stored in FTP storage rather than in Firestore

### Email Integrations

- EmailJS (`@emailjs/browser`) for frontend quote form integration
- Nodemailer for backend/admin quote notification emails via SMTP

### URL/Media Helpers

- `yt-dlp` integration for certain media platform URLs
- URL normalization logic for Google Drive/Facebook share URLs

## 8. Environment Variables

Create a `.env` file in project root for local development.

### Frontend (`VITE_*`)

```dotenv
VITE_API_BASE=http://localhost:3001

VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

VITE_EMAILJS_SERVICE_ID=...
VITE_EMAILJS_TEMPLATE_ID=...
VITE_EMAILJS_PUBLIC_KEY=...
```

### Backend

```dotenv
PORT=3001
FRONTEND_URL=http://localhost:5173

FTP_HOST=...
FTP_USER=...
FTP_PASS=...
FTP_BASE_PATH=uploads

PIPELINE_API_KEY=...

SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...

YTDLP_BIN=
YTDLP_COOKIES_FILE=
FTP_SYNC_INTERVAL_MS=15000

FIREBASE_TYPE=service_account
FIREBASE_PROJECT_ID=...
FIREBASE_PRIVATE_KEY_ID=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"
FIREBASE_CLIENT_EMAIL=...
FIREBASE_CLIENT_ID=...
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=...
```

## 9. Getting Started (Step by Step)

1. Clone the repository.

```bash
git clone <your-repo-url>
cd Digiscribe2026
```

2. Install dependencies.

```bash
npm install
```

3. Add a `.env` file using the template in Section 8.

4. Start development mode.

```bash
npm run dev
```

What this does:

- Starts Express backend (`server/server.js`) on `http://localhost:3001`
- Starts Vite frontend on `http://localhost:5173`
- Proxies frontend `/api/*` calls to backend

## 10. Available Scripts

- `npm run dev`: run backend and frontend together
- `npm run dev:server`: run backend only
- `npm run build`: build frontend to `dist`
- `npm run preview`: preview built frontend
- `npm run lint`: run ESLint
- `npm run server` or `npm start`: run backend in production style

## 11. Upload Behavior and Vercel Runtime Limits

Vercel free tier has strict serverless runtime limits. The upload system is designed to work within that constraint by:

- Splitting files into chunks on the client
- Uploading chunks incrementally
- Making finalization (`/api/upload/complete`) short and predictable

If you still hit limits in your own environment:

- Lower chunk size from frontend configuration
- Reduce concurrent chunk uploads
- Route heavy upload traffic to a dedicated backend host

## 12. Deployment Notes (Vercel)

- `vercel.json` rewrites `/api/*` to serverless API entry (`api/index.js`)
- `api/index.js` exports the Express app from `server/server.js`
- Ensure all required env variables are configured in Vercel Project Settings
- Serverless filesystem is ephemeral; temporary files must use `/tmp`

## 13. Beginner Troubleshooting

### Backend starts but auth/admin features fail

Cause: Firebase Admin env variables are missing or invalid.

Check:

- `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PROJECT_ID`
- Proper newline escaping in `FIREBASE_PRIVATE_KEY`

### Upload requests fail

Cause: FTP credentials or FTP path configuration issue.

Check:

- `FTP_HOST`, `FTP_USER`, `FTP_PASS`, `FTP_BASE_PATH`
- FTP server allows explicit TLS connections

### CORS errors in browser

Cause: frontend origin not whitelisted.

Check:

- `FRONTEND_URL` contains your exact frontend origin
- Include protocol (`http://` or `https://`)

### Quote emails are not sent

Cause: SMTP is not configured on backend.

Check:

- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_PORT`

## 14. Development Conventions

- Keep API route logic in `server/routes/*` when possible
- Keep storage path logic centralized in `server/services/ftpPathResolver.js`
- Use middleware (`verifyAuth`, `verifyAdmin`) for access control
- Keep frontend API calls aligned with backend route contracts

## 15. Security Notes

- Never commit `.env` files or service account secrets
- Limit admin role assignment to trusted accounts only
- Use HTTPS in all production environments
- Rotate FTP/SMTP/API keys periodically
