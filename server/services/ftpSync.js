/**
 * FTP ↔ Firestore reconciliation service.
 *
 * Periodically performs two-way reconciliation:
 * 1) Remove Firestore file docs whose FTP file no longer exists.
 * 2) Import FTP-created folders/files into Firestore so dashboards can see them.
 */

import path from 'path';
import { adminAuth } from '../firebaseAdmin.js';
import { existsOnFtp, listTreeOnFtp } from './ftp.js';
import { sanitizeEmail, sanitizeName } from './ftpPathResolver.js';

const BATCH_SIZE = 20;          // check N files per cycle
const CYCLE_INTERVAL_MS = Number(process.env.FTP_SYNC_INTERVAL_MS || 15000); // near real-time polling
const OWNER_CACHE_TTL_MS = 5 * 60 * 1000;
const SKIP_TOP_LEVEL_DIRS = new Set(['admin', '_chunks', '_assembling', '_deliveries']);

let timer = null;
let running = false;
let ownersCache = { expiresAt: 0, byEmailDir: new Map() };

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
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
};

function getEmailDirFromPath(relPath) {
  const [first] = String(relPath || '').split('/');
  return first || '';
}

function shouldImportPath(relPath) {
  const emailDir = getEmailDirFromPath(relPath);
  return Boolean(emailDir) && !SKIP_TOP_LEVEL_DIRS.has(emailDir);
}

function inferMimeType(fileName) {
  const ext = path.posix.extname(fileName || '').toLowerCase();
  return EXT_TO_MIME[ext] || 'application/octet-stream';
}

function encodeStorageUrl(storagePath) {
  return String(storagePath || '').split('/').map(encodeURIComponent).join('/');
}

function buildOwnerFromEmailDir(emailDir, fallbackMap, usersMap) {
  const fromUsers = usersMap.get(emailDir);
  if (fromUsers) return fromUsers;

  const fromExisting = fallbackMap.get(emailDir);
  if (fromExisting) return fromExisting;

  return {
    uid: 'ftp-import',
    email: `${emailDir || 'unknown'}@ftp.local`,
  };
}

async function getUsersByEmailDir() {
  const now = Date.now();
  if (ownersCache.expiresAt > now) return ownersCache.byEmailDir;
  if (!adminAuth) return new Map();

  try {
    const listResult = await adminAuth.listUsers(1000);
    const map = new Map();
    for (const user of listResult.users) {
      const email = String(user.email || '').trim();
      if (!email.includes('@')) continue;
      const emailDir = sanitizeEmail(email);
      if (!map.has(emailDir)) {
        map.set(emailDir, { uid: user.uid, email });
      }
    }
    ownersCache = { expiresAt: now + OWNER_CACHE_TTL_MS, byEmailDir: map };
    return map;
  } catch (err) {
    console.warn('[ftp-sync] failed to refresh users cache:', err.message);
    return ownersCache.byEmailDir || new Map();
  }
}

function buildExistingFolderPathMap(folderDocs) {
  const byId = new Map();
  const pathMemo = new Map();
  const byPath = new Map();

  for (const folder of folderDocs) {
    byId.set(folder.id, folder);
    if (folder.ftpPath) {
      byPath.set(folder.ftpPath, folder);
    }
  }

  const resolvePathById = (id, stack = new Set()) => {
    if (!id) return '';
    if (pathMemo.has(id)) return pathMemo.get(id);
    if (stack.has(id)) return '';

    const folder = byId.get(id);
    if (!folder) return '';

    stack.add(id);
    let resolved = '';

    if (folder.parentId) {
      const parentPath = resolvePathById(folder.parentId, stack);
      resolved = parentPath ? `${parentPath}/${sanitizeName(folder.name)}` : '';
    } else {
      const emailDir = sanitizeEmail(folder.createdByEmail || 'unknown');
      resolved = `${emailDir}/${sanitizeName(folder.name)}`;
    }

    stack.delete(id);
    pathMemo.set(id, resolved);
    return resolved;
  };

  for (const folder of folderDocs) {
    const computedPath = resolvePathById(folder.id);
    if (computedPath && !byPath.has(computedPath)) {
      byPath.set(computedPath, folder);
    }
  }

  return byPath;
}

async function importFromFtp(db) {
  let importedFolders = 0;
  let importedFiles = 0;

  const [tree, filesSnapshot, foldersSnapshot, usersByEmailDir] = await Promise.all([
    listTreeOnFtp(''),
    db.collection('files').get(),
    db.collection('folders').get(),
    getUsersByEmailDir(),
  ]);

  const existingFilesByStoragePath = new Map();
  const ownerFallbackByEmailDir = new Map();

  for (const doc of filesSnapshot.docs) {
    const data = doc.data();
    const storagePath = data.storagePath || data.savedAs;
    if (storagePath) existingFilesByStoragePath.set(storagePath, doc.id);

    const uploaderEmail = String(data.uploadedByEmail || '').trim();
    if (uploaderEmail.includes('@') && data.uploadedBy) {
      const emailDir = sanitizeEmail(uploaderEmail);
      if (!ownerFallbackByEmailDir.has(emailDir)) {
        ownerFallbackByEmailDir.set(emailDir, { uid: data.uploadedBy, email: uploaderEmail });
      }
    }
  }

  const existingFolders = foldersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const foldersByPath = buildExistingFolderPathMap(existingFolders);

  const sortedDirectories = [...tree.directories]
    .filter((dir) => shouldImportPath(dir.path))
    .filter((dir) => String(dir.path).split('/').length > 1)
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length);

  for (const dir of sortedDirectories) {
    if (foldersByPath.has(dir.path)) continue;

    const segments = dir.path.split('/');
    const emailDir = segments[0];
    const owner = buildOwnerFromEmailDir(emailDir, ownerFallbackByEmailDir, usersByEmailDir);
    const folderName = segments[segments.length - 1];
    const parentPath = segments.length > 2 ? segments.slice(0, -1).join('/') : null;
    const parentFolder = parentPath ? foldersByPath.get(parentPath) : null;

    const docRef = await db.collection('folders').add({
      name: folderName,
      parentId: parentFolder?.id || null,
      createdBy: owner.uid,
      createdByEmail: owner.email,
      createdAt: new Date(),
      updatedAt: new Date(),
      ftpPath: dir.path,
      syncedFromFtp: true,
    });

    const createdFolder = {
      id: docRef.id,
      name: folderName,
      parentId: parentFolder?.id || null,
      createdBy: owner.uid,
      createdByEmail: owner.email,
      ftpPath: dir.path,
    };
    foldersByPath.set(dir.path, createdFolder);
    importedFolders++;
  }

  for (const file of tree.files) {
    if (!shouldImportPath(file.path)) continue;
    if (existingFilesByStoragePath.has(file.path)) continue;

    const segments = file.path.split('/');
    if (segments.length < 2) continue;

    const emailDir = segments[0];
    const owner = buildOwnerFromEmailDir(emailDir, ownerFallbackByEmailDir, usersByEmailDir);
    const fileName = segments[segments.length - 1];
    const folderPath = segments.length > 2 ? segments.slice(0, -1).join('/') : null;
    const folder = folderPath ? foldersByPath.get(folderPath) : null;

    const uploadedAt = file.modifiedAt instanceof Date ? file.modifiedAt : new Date();
    const docRef = await db.collection('files').add({
      originalName: fileName,
      savedAs: fileName,
      size: Number(file.size) || 0,
      type: inferMimeType(fileName),
      uploadedBy: owner.uid,
      uploadedByEmail: owner.email,
      uploadedAt,
      status: 'pending',
      description: '',
      serviceCategory: '',
      sourceType: 'file',
      sourceUrl: null,
      folderId: folder?.id || null,
      storagePath: file.path,
      url: `/api/files/${encodeStorageUrl(file.path)}`,
      syncedFromFtp: true,
      updatedAt: new Date(),
    });

    existingFilesByStoragePath.set(file.path, docRef.id);
    importedFiles++;
  }

  return { importedFolders, importedFiles };
}

/**
 * Run one reconciliation cycle: pick a batch of files from Firestore and
 * verify each one still exists on FTP.  Any that are missing get deleted.
 *
 * @param {import('firebase-admin/firestore').Firestore} db - Admin Firestore instance
 */
export async function reconcileOnce(db) {
  if (running) return { checked: 0, removed: 0, importedFolders: 0, importedFiles: 0 };
  running = true;

  let checked = 0;
  let removed = 0;
  let importedFolders = 0;
  let importedFiles = 0;

  try {
    // 1) Import any new FTP-created folders/files into Firestore
    ({ importedFolders, importedFiles } = await importFromFtp(db));

    // 2) Remove Firestore docs whose FTP file disappeared
    const snapshot = await db
      .collection('files')
      .where('storagePath', '!=', null)
      .limit(BATCH_SIZE)
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const remotePath = data.storagePath || data.savedAs;
      if (!remotePath) continue;

      // Embedded URL entries have no file on FTP
      if (data.sourceType === 'url' && !data.savedAs) continue;

      checked++;

      const exists = await existsOnFtp(remotePath);
      if (!exists) {
        console.log(`[ftp-sync] File missing on FTP, removing Firestore doc ${doc.id}: ${remotePath}`);
        await doc.ref.delete();
        removed++;
      }
    }
  } catch (err) {
    console.error('[ftp-sync] reconciliation error:', err.message);
  } finally {
    running = false;
  }

  return { checked, removed, importedFolders, importedFiles };
}

/**
 * Start the background reconciliation loop.
 *
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {number} intervalMs - Override the default cycle interval
 */
export function startFtpSync(db, intervalMs = CYCLE_INTERVAL_MS) {
  if (timer) return; // already running
  console.log(`[ftp-sync] Starting background reconciliation every ${intervalMs / 1000}s`);

  const run = async () => {
    const { checked, removed, importedFolders, importedFiles } = await reconcileOnce(db);
    if (removed > 0 || importedFolders > 0 || importedFiles > 0) {
      console.log(`[ftp-sync] Cycle done — checked ${checked}, removed ${removed}, imported folders ${importedFolders}, imported files ${importedFiles}`);
    }
  };

  // First run after a short delay to let the server finish starting
  setTimeout(run, 5000);
  timer = setInterval(run, intervalMs);
}

/**
 * Stop the background reconciliation loop.
 */
export function stopFtpSync() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('[ftp-sync] Background reconciliation stopped');
  }
}
