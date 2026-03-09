import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import { adminAuth, adminDb } from './firebaseAdmin.js';
import { verifyAuth, verifyAdmin } from './middleware/authMiddleware.js';
import usersRouter from './routes/users.js';
import filesRouter from './routes/files.js';
import pipelineRouter from './routes/pipeline.js';
import transcriptionsRouter from './routes/transcriptions.js';
import foldersRouter from './routes/folders.js';
import { uploadToFtp, uploadBufferToFtp, appendBufferToFtp, moveOnFtp, downloadFromFtp, streamFromFtp, ftpFileSize, deleteFromFtp } from './services/ftp.js';
import { resolveFolderFtpPath, computeFileFtpPath, sanitizeName } from './services/ftpPathResolver.js';
import { startFtpSync, reconcileOnce } from './services/ftpSync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IS_VERCEL = !!process.env.VERCEL;
const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);

// Email transporter (optional — only active when SMTP_USER/PASS are configured)
let emailTransporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  console.log('[email] SMTP transporter configured.');
} else {
  console.log('[email] SMTP not configured — quote notifications will be skipped.');
}

console.log('[startup] adminDb initialized:', !!adminDb);

// Temporary directory for chunk uploads and in-flight processing
// Vercel serverless functions can only write to /tmp
const chunksDir = IS_VERCEL ? '/tmp/chunks' : path.join(__dirname, 'chunks');
if (!fs.existsSync(chunksDir)) fs.mkdirSync(chunksDir, { recursive: true });

// Periodic cleanup of orphaned chunk files (abandoned uploads where user closed the tab)
const CHUNK_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
function cleanupOrphanedChunks() {
  try {
    const now = Date.now();
    const entries = fs.readdirSync(chunksDir);
    let cleaned = 0;
    for (const name of entries) {
      if (name === 'assemble-tmp' || name === '_deliveries') continue;
      const fullPath = path.join(chunksDir, name);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && (now - stat.mtimeMs) > CHUNK_MAX_AGE_MS) {
          fs.unlinkSync(fullPath);
          cleaned++;
        }
      } catch { /* skip individual errors */ }
    }
    if (cleaned > 0) console.log(`[cleanup] Removed ${cleaned} orphaned chunk file(s)`);
  } catch { /* ignore */ }
}

// Run cleanup every 10 minutes
if (!IS_VERCEL) {
  setInterval(cleanupOrphanedChunks, 10 * 60 * 1000);
  // Initial cleanup after 30s
  setTimeout(cleanupOrphanedChunks, 30_000);
}

// CORS — allow dev + production origins
// FRONTEND_URL supports comma-separated values, e.g.:
//   https://digiscribedev2026.onrender.com,https://devteam.digiscribeasiapacific.com
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://devteam.digiscribeasiapacific.com',
  'https://devteam.digiscribeasiapacific.com',
  ...(process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((u) => u.trim())
    : []),
].filter(Boolean);

function normalizeOrigin(input) {
  if (!input) return '';
  try {
    const parsed = new URL(input);
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch {
    return String(input).trim().replace(/\/+$/, '').toLowerCase();
  }
}

const allowedOriginSet = new Set(allowedOrigins.map(normalizeOrigin));
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false,
}));
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const normalized = normalizeOrigin(origin);
    if (allowedOriginSet.has(normalized)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'x-pipeline-key'],
}));
app.use(express.json({ limit: '1mb' }));

const quoteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many quote requests. Please try again later.' },
});

const uploadUrlLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many URL upload requests. Please try again later.' },
});

const pipelineLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many pipeline requests. Please try again later.' },
});

// Accept any image/*, audio/*, video/* MIME type.
// Admins can also upload document types (PDF, Word, etc.)
const ADMIN_ALLOWED_DOC_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const ADMIN_ALLOWED_DOC_EXTENSIONS = new Set(['.pdf', '.txt', '.doc', '.docx']);

function isAllowedMime(mime, role, fileName = '') {
  const normalizedMime = String(mime || '').toLowerCase();
  const ext = path.posix.extname(String(fileName || '')).toLowerCase();

  if (!normalizedMime) {
    return role === 'admin' && !!ext && ADMIN_ALLOWED_DOC_EXTENSIONS.has(ext);
  }
  if (normalizedMime.startsWith('image/') || normalizedMime.startsWith('audio/') || normalizedMime.startsWith('video/')) return true;
  if (role === 'admin') {
    if (ADMIN_ALLOWED_DOC_MIME_TYPES.has(normalizedMime)) return true;
    if (ext && ADMIN_ALLOWED_DOC_EXTENSIONS.has(ext)) return true;
  }
  return false;
}

function getFileCategory(mimeType) {
  if (mimeType?.startsWith('video/')) return 'Video';
  if (mimeType?.startsWith('audio/')) return 'Audio';
  if (mimeType?.startsWith('image/')) return 'Image';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType?.startsWith('application/')) return 'Document';
  return 'Other';
}

// Build a flat filename prefix: {Service}_{timestamp}
// The uploader's email is now used as the FTP directory, not baked into the filename.
function buildFilePrefix(serviceCategory) {
  const svc = (serviceCategory || 'Uncategorized').replace(/[^a-zA-Z0-9_-]/g, '_');
  return svc;
}

// Encode each path segment individually so slashes remain literal slashes in URLs.
function encodeStorageUrl(storagePath) {
  return storagePath.split('/').map(encodeURIComponent).join('/');
}

function getAssemblingRemotePath(uploadId) {
  const safeUploadId = String(uploadId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `_assembling/${safeUploadId}.bin`;
}

const EXT_TO_MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.jfif': 'image/jpeg',
  '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.avif': 'image/avif',
  '.heic': 'image/heic', '.heif': 'image/heif',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.aac': 'audio/aac',
  '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.opus': 'audio/opus',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
  '.wmv': 'video/x-ms-wmv', '.m4v': 'video/mp4',
  // Documents (admin uploads)
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain', '.csv': 'text/csv',
};

// Multer for chunk uploads
const chunkUpload = multer({ storage: multer.memoryStorage() });

// Mount API routes
app.use('/api/quote', quoteLimiter);
app.use('/api/upload/url', uploadUrlLimiter);
app.use('/api/pipeline', pipelineLimiter);
app.use('/api/admin', usersRouter);
app.use('/api/files', filesRouter);
app.use('/api/pipeline', pipelineRouter);
app.use('/api/transcriptions', transcriptionsRouter);
app.use('/api/folders', foldersRouter);

// POST /api/upload/chunk - receive a single chunk (auth required)
app.post('/api/upload/chunk', verifyAuth, chunkUpload.single('chunk'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No chunk received.' });

  const { uploadId, chunkIndex, chunkStart } = req.body || {};
  if (!uploadId || chunkIndex === undefined || chunkStart === undefined) {
    return res.status(400).json({ success: false, error: 'Missing uploadId, chunkIndex, or chunkStart.' });
  }

  try {
    if (IS_VERCEL) {
      const startOffset = Number.parseInt(String(chunkStart), 10);
      if (!Number.isFinite(startOffset) || startOffset < 0) {
        return res.status(400).json({ success: false, error: 'Invalid chunkStart.' });
      }

      const assemblingPath = getAssemblingRemotePath(uploadId);
      let assembledSize = 0;
      try {
        assembledSize = await ftpFileSize(assemblingPath);
      } catch {
        assembledSize = 0;
      }

      // If current assembled size is already past this chunk start, this is a retry and
      // we can acknowledge success without appending duplicate bytes.
      if (assembledSize > startOffset) {
        return res.json({ success: true, dedup: true });
      }

      // Reject out-of-order chunks in production so byte order remains correct.
      if (assembledSize < startOffset) {
        return res.status(409).json({
          success: false,
          error: `Chunk out of order. Expected offset ${assembledSize}, received ${startOffset}.`,
        });
      }

      // Build remote assembled file incrementally to make /complete constant-time.
      if (Number(chunkIndex) === 0 && assembledSize === 0) {
        await uploadBufferToFtp(req.file.buffer, assemblingPath);
      } else {
        await appendBufferToFtp(req.file.buffer, assemblingPath);
      }

      return res.json({ success: true });
    }

    const chunkPath = path.join(chunksDir, `${uploadId}-chunk-${chunkIndex}`);
    await fs.promises.writeFile(chunkPath, req.file.buffer);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to write chunk.' });
  }
});

// POST /api/upload/complete - assemble chunks into final file (auth required)
app.post('/api/upload/complete', verifyAuth, async (req, res) => {
  try {
    const { uploadId, fileName, totalChunks, mimeType, description, serviceCategory, folderId } = req.body;

    console.log('[upload/complete] Received fileName:', fileName);

    if (!uploadId || !fileName || !totalChunks) {
      return res.status(400).json({ success: false, error: 'Missing required fields.' });
    }

    if (!isAllowedMime(mimeType, req.user.role, fileName)) {
      return res.status(400).json({ success: false, error: 'File type not allowed. Admin uploads support media plus PDF/TXT/DOC/DOCX documents only.' });
    }

    // Build filename: {Service}_{timestamp}-{filename}
    const prefix = buildFilePrefix(serviceCategory);
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const finalName = `${prefix}_${Date.now()}-${safeName}`;
    // Per-user directory: {email}/{filename}
    const emailDir = (req.user.email || 'unknown').split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '_') || 'unknown';
    const defaultStoragePath = `${emailDir}/${finalName}`;

    // If uploading into a folder, place the file inside the folder FTP path (already includes email dir)
    let storagePath = defaultStoragePath;
    if (folderId) {
      try {
        const folderFtpPath = await resolveFolderFtpPath(folderId, adminDb);
        if (folderFtpPath) {
          storagePath = `${folderFtpPath}/${finalName}`;
        }
      } catch (e) {
        console.warn('[upload/complete] folder path resolution failed, using default path:', e.message);
      }
    }
    let finalSize = 0;

    if (IS_VERCEL) {
      const assemblingPath = getAssemblingRemotePath(uploadId);
      finalSize = await ftpFileSize(assemblingPath);

      // Move assembled temp file into final structured storage path (no re-upload copy).
      await moveOnFtp(assemblingPath, storagePath);
    } else {
      const storageDir = path.join(chunksDir, 'assemble-tmp');
      if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

      const finalPath = path.join(storageDir, finalName);
      const writeStream = fs.createWriteStream(finalPath);

      const appendChunkToStream = (chunkPath) => new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(chunkPath);

        const onReadError = (err) => {
          cleanup();
          reject(err);
        };

        const onWriteError = (err) => {
          cleanup();
          reject(err);
        };

        const onReadEnd = () => {
          cleanup();
          resolve();
        };

        const cleanup = () => {
          readStream.off('error', onReadError);
          readStream.off('end', onReadEnd);
          writeStream.off('error', onWriteError);
        };

        readStream.on('error', onReadError);
        readStream.on('end', onReadEnd);
        writeStream.on('error', onWriteError);
        readStream.pipe(writeStream, { end: false });
      });

      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(chunksDir, `${uploadId}-chunk-${i}`);
        if (!fs.existsSync(chunkPath)) {
          writeStream.destroy();
          if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
          return res.status(400).json({ success: false, error: `Missing chunk ${i}.` });
        }

        await appendChunkToStream(chunkPath);
      }

      writeStream.end();
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      const stats = await fs.promises.stat(finalPath);
      finalSize = stats.size;

      // Clean up local chunk files
      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(chunksDir, `${uploadId}-chunk-${i}`);
        if (fs.existsSync(chunkPath)) {
          await fs.promises.unlink(chunkPath).catch(() => {});
        }
      }

      await uploadToFtp(finalPath, storagePath);
      await fs.promises.unlink(finalPath).catch(() => {});
    }

    // Save metadata to Firestore
    let fileId = null;
    if (adminDb) {
      console.log('[upload/complete] Writing metadata to Firestore for:', finalName);
      const docRef = await adminDb.collection('files').add({
        originalName: fileName,
        savedAs: finalName,
        storagePath,
        size: finalSize,
        type: mimeType,
        fileCategory: getFileCategory(mimeType),
        uploadedBy: req.user.uid,
        uploadedByEmail: req.user.email || '',
        uploadedAt: new Date(),
        status: 'pending',
        description: description || '',
        serviceCategory: serviceCategory || '',
        sourceType: 'file',
        sourceUrl: null,
        folderId: folderId || null,
        url: `/api/files/${encodeStorageUrl(storagePath)}`,
      });
      fileId = docRef.id;
      console.log('[upload/complete] Firestore doc created:', fileId);
    } else {
      console.error('[upload/complete] adminDb is null — metadata not saved for:', finalName);
    }

    res.json({
      success: true,
      message: `"${fileName}" uploaded successfully.`,
      file: { originalName: fileName, savedAs: finalName, size: finalSize, type: mimeType },
      fileId,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Assembly failed.' });
  }
});

// POST /api/upload/url - Upload from URL (auth required)
app.post('/api/upload/url', verifyAuth, async (req, res) => {
  const { url, customName, description, serviceCategory, folderId } = req.body;

  console.log('[upload/url] Received customName:', customName);

  if (!url) {
    return res.status(400).json({ success: false, error: 'URL is required.' });
  }

  let normalizedInputUrl = '';
  try {
    const parsed = new URL(String(url).trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ success: false, error: 'Only HTTP(S) URLs are allowed.' });
    }
    normalizedInputUrl = parsed.toString();
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid URL format.' });
  }

  if (normalizedInputUrl.length > 2048) {
    return res.status(400).json({ success: false, error: 'URL is too long.' });
  }

  const normalizedDescription = typeof description === 'string' ? description.trim() : '';
  if (normalizedDescription.length > 2000) {
    return res.status(400).json({ success: false, error: 'Description must be 2000 characters or less.' });
  }

  try {
    const effectiveUrl = await normalizeUrlUploadTarget(normalizedInputUrl);
    const sourceUrlForMetadata = getSourceUrlForMetadata(normalizedInputUrl, effectiveUrl);

    let displayName = customName?.trim();
    if (!displayName) {
      try {
        const parsed = new URL(sourceUrlForMetadata || url);
        const baseName = path.basename(parsed.pathname || '').trim();
        if (baseName && baseName.toLowerCase() !== 'uc') {
          displayName = baseName;
        } else {
          displayName = parsed.hostname.replace(/^www\./i, '') || url;
        }
      } catch {
        displayName = url;
      }
    }

    let fileId = null;
    if (adminDb) {
      const docRef = await adminDb.collection('files').add({
        originalName: displayName,
        savedAs: null,
        storagePath: null,
        size: 0,
        type: 'application/x-url',
        fileCategory: 'URL',
        uploadedBy: req.user.uid,
        uploadedByEmail: req.user.email || '',
        uploadedAt: new Date(),
        status: 'pending',
        description: normalizedDescription,
        serviceCategory: serviceCategory || '',
        sourceType: 'url',
        sourceUrl: sourceUrlForMetadata,
        folderId: folderId || null,
        url: sourceUrlForMetadata,
      });
      fileId = docRef.id;
    }

    res.json({
      success: true,
      embedded: true,
      message: 'Saved as URL entry (metadata only).',
      file: { originalName: displayName, savedAs: null, size: 0, type: 'application/x-url' },
      fileId,
    });
  } catch (err) {
    console.error('[upload/url] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

async function normalizeUrlUploadTarget(inputUrl) {
  try {
    const parsed = new URL(inputUrl);
    const hostname = parsed.hostname.replace('www.', '').toLowerCase();
    const pathname = parsed.pathname || '';

    if (hostname === 'drive.google.com') {
      const pathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
      const idFromPath = pathMatch?.[1] || null;
      const idFromQuery = parsed.searchParams.get('id');
      const fileId = idFromPath || idFromQuery;

      if (fileId) {
        return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
      }
    }

    if ((hostname === 'facebook.com' && pathname.startsWith('/share/')) || hostname === 'fb.watch') {
      const resolved = await resolveRedirectUrl(inputUrl);
      return resolved || inputUrl;
    }

    return inputUrl;
  } catch {
    return inputUrl;
  }
}

async function resolveRedirectUrl(inputUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(inputUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DigiScribeURLResolver/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);

    const finalUrl = res?.url || inputUrl;

    try {
      const finalParsed = new URL(finalUrl);
      const next = finalParsed.searchParams.get('next');
      if (next && finalParsed.hostname.includes('facebook.com')) {
        return decodeURIComponent(next);
      }
    } catch {
      // ignore
    }

    return finalUrl;
  } catch {
    return inputUrl;
  }
}

function getSourceUrlForMetadata(originalUrl, effectiveUrl) {
  try {
    const parsed = new URL(originalUrl);
    const hostname = parsed.hostname.replace('www.', '').toLowerCase();
    const pathname = parsed.pathname || '';

    // Preserve original URL for most providers, but store resolved URL for
    // Facebook share wrappers so frontend embeds receive canonical targets.
    if ((hostname === 'facebook.com' && pathname.startsWith('/share/')) || hostname === 'fb.watch') {
      return effectiveUrl || originalUrl;
    }

    return originalUrl;
  } catch {
    return originalUrl;
  }
}

function normalizeRole(decodedToken = {}) {
  if (!decodedToken.role) {
    return decodedToken.admin ? 'admin' : 'user';
  }
  if (decodedToken.role === 'superAdmin' || decodedToken.role === 'lguAdmin') {
    return 'admin';
  }
  return decodedToken.role;
}

function encodeStoragePath(storagePath) {
  return String(storagePath || '').split('/').map(encodeURIComponent).join('/');
}

async function getAuthenticatedFileUser(req) {
  if (!adminAuth) return null;

  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const queryToken = typeof req.query?.access_token === 'string' ? req.query.access_token.trim() : '';
  const token = bearerToken || queryToken;
  if (!token) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return {
      ...decoded,
      role: normalizeRole(decoded),
    };
  } catch {
    return null;
  }
}

async function canAccessStoragePath(user, normalizedPath) {
  if (!user || !normalizedPath || !adminDb) return false;
  if (user.role === 'admin') return true;

  const filePathFields = ['storagePath', 'savedAs', 'sourceReferenceStoragePath', 'transcriptionStoragePath'];
  for (const field of filePathFields) {
    try {
      const snap = await adminDb.collection('files').where(field, '==', normalizedPath).limit(5).get();
      if (!snap.empty) {
        const ownsAny = snap.docs.some((doc) => doc.data()?.uploadedBy === user.uid);
        if (ownsAny) return true;
      }
    } catch {
      // ignore and continue with fallback checks
    }
  }

  const deliveryPathVariants = [
    `/api/files/${normalizedPath}`,
    `/api/files/${encodeURIComponent(normalizedPath)}`,
    `/api/files/${encodeStoragePath(normalizedPath)}`,
  ];

  try {
    const uniqueVariants = [...new Set(deliveryPathVariants)].slice(0, 10);
    const transcriptionsSnap = await adminDb
      .collection('transcriptions')
      .where('deliveryFileUrl', 'in', uniqueVariants)
      .limit(10)
      .get();
    if (!transcriptionsSnap.empty) {
      const ownsDelivery = transcriptionsSnap.docs.some((doc) => doc.data()?.uploadedBy === user.uid);
      if (ownsDelivery) return true;
    }
  } catch {
    // ignore and deny by default
  }

  return false;
}

// POST /api/files/bulk-download - Download multiple files as a zip (auth required)
app.post('/api/files/bulk-download', verifyAuth, async (req, res) => {
  const { fileIds } = req.body;
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ success: false, error: 'fileIds array is required.' });
  }

  try {
    // Fetch file docs
    const docs = await Promise.all(fileIds.map((id) => adminDb.collection('files').doc(id).get()));
    const files = docs.filter((d) => d.exists).map((d) => ({ id: d.id, ...d.data() }));

    if (files.length === 0) {
      return res.status(404).json({ success: false, error: 'No files found.' });
    }

    // Non-admins can only download their own files
    if (req.user.role !== 'admin') {
      const unauthorized = files.find((f) => f.uploadedBy !== req.user.uid);
      if (unauthorized) {
        return res.status(403).json({ success: false, error: 'Access denied to one or more files.' });
      }
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="digiscribe-files-${Date.now()}.zip"`);

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.on('error', (err) => res.status(500).json({ success: false, error: err.message }));
    archive.pipe(res);

    const tempFiles = [];
    for (const file of files) {
      if (!file.storagePath && !file.savedAs) continue;
      const remotePath = file.storagePath || file.savedAs;
      const tmpFile = path.join(chunksDir, `dl-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      try {
        await downloadFromFtp(remotePath, tmpFile);
        archive.file(tmpFile, { name: file.originalName || path.basename(remotePath) });
        tempFiles.push(tmpFile);
      } catch (dlErr) {
        console.warn('[bulk-download] Could not download:', remotePath, dlErr.message);
      }
    }

    await archive.finalize();
    // Clean up temp files after archiving
    for (const tmp of tempFiles) {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

// POST /api/files/bulk-delete - Delete multiple files
app.post('/api/files/bulk-delete', verifyAuth, async (req, res) => {
  const { fileIds } = req.body;
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ success: false, error: 'fileIds array is required.' });
  }

  try {
    let deleted = 0;
    for (const id of fileIds) {
      const docRef = adminDb.collection('files').doc(id);
      const doc = await docRef.get();
      if (!doc.exists) continue;

      const fileData = doc.data();

      // Non-admins can only delete their own files
      if (req.user.role !== 'admin' && fileData.uploadedBy !== req.user.uid) continue;

      const remotePath = fileData.storagePath || fileData.savedAs;
      if (remotePath) {
        await deleteFromFtp(remotePath);
      }

      await docRef.delete();
      deleted++;
    }

    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/files/bulk-move - Move multiple files to a folder (auth required)
app.post('/api/files/bulk-move', verifyAuth, async (req, res) => {
  const { fileIds, folderId } = req.body;
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ success: false, error: 'fileIds array is required.' });
  }
  try {
    // If folderId specified, verify folder exists
    if (folderId) {
      const folderDoc = await adminDb.collection('folders').doc(folderId).get();
      if (!folderDoc.exists) {
        return res.status(404).json({ success: false, error: 'Folder not found.' });
      }
    }
    let moved = 0;
    for (const id of fileIds) {
      const docRef = adminDb.collection('files').doc(id);
      const doc = await docRef.get();
      if (!doc.exists) continue;
      const fileData = doc.data();
      // Non-admins can only move their own files
      if (req.user.role !== 'admin' && fileData.uploadedBy !== req.user.uid) continue;

      // --- FTP sync: move file on FTP to the target folder path ---
      const oldStoragePath = fileData.storagePath || fileData.savedAs;
      let newStoragePath = oldStoragePath;
      try {
        newStoragePath = await computeFileFtpPath(fileData, folderId || null, adminDb);
        if (oldStoragePath && newStoragePath && oldStoragePath !== newStoragePath) {
          await moveOnFtp(oldStoragePath, newStoragePath);
        }
      } catch (ftpErr) {
        console.warn('[ftp] bulk-move warning for', id, ':', ftpErr.message);
        newStoragePath = oldStoragePath; // fallback: keep old path
      }

      const updateData = { folderId: folderId || null, updatedAt: new Date() };
      if (newStoragePath !== oldStoragePath) {
        updateData.storagePath = newStoragePath;
        const encodedPath = newStoragePath.split('/').map(encodeURIComponent).join('/');
        updateData.url = `/api/files/${encodedPath}`;
      }
      await docRef.update(updateData);
      moved++;
    }
    res.json({ success: true, moved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ftp-sync - Manually trigger FTP→DB reconciliation (admin only)
app.post('/api/ftp-sync', verifyAdmin, async (req, res) => {
  try {
    const result = await reconcileOnce(adminDb);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/files/bulk-status - Bulk change status (admin only)
app.post('/api/files/bulk-status', verifyAdmin, async (req, res) => {
  const { fileIds, status } = req.body;
  const validStatuses = ['pending', 'in-progress', 'transcribed'];
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ success: false, error: 'fileIds array is required.' });
  }
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: `Invalid status.` });
  }
  try {
    let updated = 0;
    for (const id of fileIds) {
      const docRef = adminDb.collection('files').doc(id);
      const doc = await docRef.get();
      if (!doc.exists) continue;
      await docRef.update({ status, updatedAt: new Date() });
      updated++;
    }
    res.json({ success: true, updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/files/download-folder/:folderId - Download entire folder as ZIP (auth required)
app.post('/api/files/download-folder/:folderId', verifyAuth, async (req, res) => {
  const { folderId } = req.params;
  try {
    // Get all files in this folder (and optionally subfolders)
    let query = adminDb.collection('files').where('folderId', '==', folderId);
    if (req.user.role !== 'admin') {
      query = query.where('uploadedBy', '==', req.user.uid);
    }
    const snapshot = await query.get();
    const files = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (files.length === 0) {
      return res.status(404).json({ success: false, error: 'No files in this folder.' });
    }

    // Get folder name for zip filename
    const folderDoc = await adminDb.collection('folders').doc(folderId).get();
    const folderName = folderDoc.exists ? (folderDoc.data().name || 'folder') : 'folder';
    const safeFolderName = folderName.replace(/[^a-z0-9_\-]/gi, '_');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFolderName}-${Date.now()}.zip"`);

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.on('error', (err) => { if (!res.headersSent) res.status(500).json({ success: false, error: err.message }); });
    archive.pipe(res);

    const tempFiles = [];
    for (const file of files) {
      if (!file.storagePath && !file.savedAs) continue;
      const remotePath = file.storagePath || file.savedAs;
      const tmpFile = path.join(chunksDir, `folderdl-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      try {
        await downloadFromFtp(remotePath, tmpFile);
        archive.file(tmpFile, { name: file.originalName || path.basename(remotePath) });
        tempFiles.push(tmpFile);
      } catch (dlErr) {
        console.warn('[folder-download] Could not download:', remotePath, dlErr.message);
      }
    }

    await archive.finalize();
    for (const tmp of tempFiles) {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

// POST /api/quote - Public contact/quote form submission
app.post('/api/quote', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, subject, message } = req.body;
    if (!email || !message) {
      return res.status(400).json({ success: false, error: 'Email and message are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedMessage = String(message).trim();
    const normalizedFirstName = String(firstName || '').trim();
    const normalizedLastName = String(lastName || '').trim();
    const normalizedPhone = String(phone || '').trim();

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
    if (!emailOk) {
      return res.status(400).json({ success: false, error: 'A valid email address is required.' });
    }
    if (normalizedMessage.length === 0 || normalizedMessage.length > 5000) {
      return res.status(400).json({ success: false, error: 'Message must be between 1 and 5000 characters.' });
    }

    // Store in Firestore
    await adminDb.collection('quotes').add({
      firstName: normalizedFirstName.slice(0, 120),
      lastName: normalizedLastName.slice(0, 120),
      email: normalizedEmail,
      phone: normalizedPhone.slice(0, 40),
      subject: subject || 'service-details',
      message: normalizedMessage,
      submittedAt: new Date().toISOString(),
    });

    if (!emailTransporter) {
      return res.status(500).json({ success: false, error: 'Email service is not configured. Please try again later.' });
    }

    // Read notification email from Firestore settings (no fallback)
    const settingsDoc = await adminDb.collection('settings').doc('notifications').get();
    const notificationEmail = settingsDoc.exists ? (settingsDoc.data().quoteEmail || '') : '';

    if (!notificationEmail) {
      return res.status(500).json({ success: false, error: 'Notification email is not configured.' });
    }

    const subjectLabels = {
      'service-details': 'Service Details',
      'service-status': 'Service Status',
      'general-inquiry': 'General Inquiry',
      'transcription': 'Transcription',
    };
    const subjectLabel = subjectLabels[subject] || subject || 'General';
    const fullName = `${normalizedFirstName} ${normalizedLastName}`.trim() || 'Unknown';

    try {
      await emailTransporter.sendMail({
        from: `"DigiScribe Website" <${process.env.SMTP_USER}>`,
        to: notificationEmail,
        replyTo: normalizedEmail,
        subject: `New Quote Request: ${subjectLabel} — ${fullName}`,
        text: `New quote/contact form submission:\n\nName: ${fullName}\nEmail: ${normalizedEmail}\nPhone: ${normalizedPhone || 'N/A'}\nSubject: ${subjectLabel}\n\nMessage:\n${normalizedMessage}`,
        html: `<h2 style="color:#0284c7">New Quote Request</h2>
<table style="border-collapse:collapse;width:100%;max-width:600px;font-family:sans-serif;font-size:14px">
<tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:600;color:#374151;width:120px">Name</td><td style="padding:10px 14px;color:#111">${fullName}</td></tr>
      <tr><td style="padding:10px 14px;font-weight:600;color:#374151">Email</td><td style="padding:10px 14px"><a href="mailto:${normalizedEmail}" style="color:#0284c7">${normalizedEmail}</a></td></tr>
      <tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:600;color:#374151">Phone</td><td style="padding:10px 14px;color:#111">${normalizedPhone || 'N/A'}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600;color:#374151">Subject</td><td style="padding:10px 14px;color:#111">${subjectLabel}</td></tr>
</table>
<h3 style="color:#374151;font-family:sans-serif;margin-top:20px">Message</h3>
      <p style="font-family:sans-serif;font-size:14px;color:#374151;white-space:pre-wrap;background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e5e7eb">${normalizedMessage.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`,
      });
      console.log('[quote] Email sent to', notificationEmail);
    } catch (emailErr) {
      console.error('[quote] Email send failed:', emailErr.message);
      return res.status(500).json({ success: false, error: 'Failed to send email notification. Please try again.' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[quote] Error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to submit. Please try again.' });
  }
});

// GET /api/admin/settings - Get admin notification settings
app.get('/api/admin/settings', verifyAdmin, async (req, res) => {
  try {
    const doc = await adminDb.collection('settings').doc('notifications').get();
    const data = doc.exists ? doc.data() : {};
    res.json({ success: true, settings: { quoteEmail: data.quoteEmail || '' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/settings - Update admin notification settings
app.put('/api/admin/settings', verifyAdmin, async (req, res) => {
  try {
    const { quoteEmail } = req.body;
    await adminDb.collection('settings').doc('notifications').set({ quoteEmail: quoteEmail || '' }, { merge: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/files/* - Serve uploaded files via FTP proxy with range request support
app.get('/api/files/*path', async (req, res) => {
  // req.params.path is an array of decoded segments in this Express version
  const segments = Array.isArray(req.params.path) ? req.params.path : [req.params.path];
  // decodeURIComponent handles old Firestore records that stored %2F-encoded paths
  const requestPath = decodeURIComponent(segments.join('/'));

  // Skip metadata routes
  if (requestPath.startsWith('metadata')) return res.status(404).json({ success: false, error: 'Not found.' });

  // Prevent path traversal
  const normalized = path.posix.normalize(requestPath).replace(/^(\.\.(\/|$))+/, '');

  const authenticatedUser = await getAuthenticatedFileUser(req);
  if (!authenticatedUser) {
    return res.status(401).json({ success: false, error: 'Authentication required.' });
  }

  const canAccess = await canAccessStoragePath(authenticatedUser, normalized);
  if (!canAccess) {
    return res.status(403).json({ success: false, error: 'Access denied.' });
  }

  const safeName = path.basename(normalized);
  const ext = path.extname(safeName).toLowerCase();
  const mime = EXT_TO_MIME[ext] || 'application/octet-stream';

  let fileSize;
  try {
    fileSize = await ftpFileSize(normalized);
  } catch {
    return res.status(404).json({ success: false, error: 'File not found on FTP.' });
  }

  const isDownload = req.query.download === '1';
  res.setHeader('Content-Disposition', `${isDownload ? 'attachment' : 'inline'}; filename="${safeName}"`);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mime);

  const rangeHeader = req.headers.range;
  if (rangeHeader) {
    const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-');
    const parsedStart = parseInt(startStr, 10);
    const start = Number.isFinite(parsedStart) ? parsedStart : 0;

    // We stream to EOF for reliability on large media files. Explicit end ranges
    // are treated as open-ended ranges to avoid buffering entire files locally.
    const parsedEnd = endStr ? parseInt(endStr, 10) : fileSize - 1;
    const end = Number.isFinite(parsedEnd) ? Math.max(parsedEnd, start) : fileSize - 1;
    const streamEnd = fileSize - 1;

    if (start >= fileSize || start > end) {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      return res.status(416).end();
    }

    const chunkSize = streamEnd - start + 1;
    res.setHeader('Content-Range', `bytes ${start}-${streamEnd}/${fileSize}`);
    res.setHeader('Content-Length', chunkSize);
    res.status(206);

    try {
      await streamFromFtp(normalized, res, { startAt: start });
    } catch (err) {
      if (!res.headersSent) {
        return res.status(500).json({ success: false, error: 'Failed to stream file.' });
      }
    }
  } else {
    res.setHeader('Content-Length', fileSize);
    res.status(200);

    try {
      await streamFromFtp(normalized, res, { startAt: 0 });
    } catch {
      if (!res.headersSent) {
        return res.status(500).json({ success: false, error: 'Failed to stream file.' });
      }
    }
  }
});

// --- Serve React build (production, non-Vercel only — Vercel serves static files natively) ---
if (!IS_VERCEL) {
  const distPath = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    // Catch-all: serve index.html for React Router client-side routes
    app.get('*splat', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

// --- Start server (used by cPanel Passenger & local dev, skipped on Vercel) ---
if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`FTP host: ${process.env.FTP_HOST || '(not configured)'}`);
    console.log(`FTP base path: ${process.env.FTP_BASE_PATH || 'uploads'}`);

    // Start background FTP→DB reconciliation (every 60s)
    if (adminDb) {
      startFtpSync(adminDb);
    }
  });
}

// Export for Vercel serverless functions & Passenger (cPanel Node.js)
export default app;
