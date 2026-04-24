import path from 'path';
import { mapWithConcurrencyLimit } from './concurrency.js';

/**
 * Sanitise an email into a safe FTP directory name (username part only).
 */
function sanitizeEmail(email) {
  return ((email || 'unknown').split('@')[0] || 'unknown')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_') || 'unknown';
}

/**
 * Sanitise a folder name for use as a safe FTP directory component.
 * Replaces anything that is not alphanumeric, space, underscore, hyphen, or period
 * with an underscore, then collapses consecutive underscores.
 */
function sanitizeName(name) {
  return (name || 'Untitled')
    .replace(/[^a-zA-Z0-9 _\-().]/g, '_')
    .replace(/_+/g, '_')
    .trim() || 'Untitled';
}

/**
 * Resolves the full FTP directory path for a Firestore folder by walking up
 * the parentId chain.  The top-level directory is always the root-ancestor
 * folder creator's email (username part), giving a per-user FTP layout:
 *   {email}/{FolderA}/{SubFolder}/...
 *
 * @param {string} folderId - Firestore folder document ID
 * @param {FirebaseFirestore.Firestore} db - Admin Firestore instance
 * @returns {Promise<string>} The folder path relative to FTP_BASE, e.g. "john/{FolderA}"
 */
export async function resolveFolderFtpPath(folderId, db) {
  if (!folderId) return '';
  const parts = [];
  let currentId = folderId;
  const visited = new Set();
  let rootEmail = '';

  while (currentId) {
    if (visited.has(currentId)) break; // guard against circular refs
    visited.add(currentId);
    const doc = await db.collection('folders').doc(currentId).get();
    if (!doc.exists) break;
    const data = doc.data();
    parts.unshift(sanitizeName(data.name));
    // Keep updating — the last iteration is the root ancestor
    rootEmail = data.createdByEmail || rootEmail;
    currentId = data.parentId || null;
  }

  const emailDir = sanitizeEmail(rootEmail);
  return `${emailDir}/${parts.join('/')}`;
}

/**
 * Computes the FTP storage path for a file, given its folder (or null for root).
 * - Files in a folder: {email}/{folderPath}/{savedAs}
 * - Files at root (no folder): {email}/{savedAs}
 *
 * @param {object} fileData - Firestore file document data
 * @param {string|null} targetFolderId - Target folder ID (null = root)
 * @param {FirebaseFirestore.Firestore} db - Admin Firestore instance
 * @returns {Promise<string>} New storagePath
 */
export async function computeFileFtpPath(fileData, targetFolderId, db) {
  const fileName = fileData.savedAs || path.posix.basename(fileData.storagePath || '');
  if (!fileName) return fileData.storagePath || '';

  const emailDir = sanitizeEmail(fileData.uploadedByEmail);

  if (!targetFolderId) {
    // Moving to root — file stays in user's top-level directory
    return `${emailDir}/${fileName}`;
  }

  const folderPath = await resolveFolderFtpPath(targetFolderId, db);
  return folderPath ? `${folderPath}/${fileName}` : `${emailDir}/${fileName}`;
}

/**
 * Recursively collects all descendant folder IDs of a given folder.
 *
 * @param {string} folderId
 * @param {FirebaseFirestore.Firestore} db
 * @returns {Promise<string[]>} Array of folder IDs (not including the given one)
 */
export async function getDescendantFolderIds(folderId, db) {
  const ids = [];
  const queue = [folderId];

  while (queue.length > 0) {
    const current = queue.shift();
    const snap = await db.collection('folders').where('parentId', '==', current).get();
    for (const doc of snap.docs) {
      ids.push(doc.id);
      queue.push(doc.id);
    }
  }

  return ids;
}

/**
 * Updates storagePath and url for all files inside a folder (and its descendants)
 * after the folder's FTP path changed (e.g. folder renamed or moved).
 *
 * @param {string} folderId - The folder whose FTP path changed
 * @param {FirebaseFirestore.Firestore} db
 */
export async function updateDescendantFilePaths(folderId, db, onFileUpdated) {
  const allFolderIds = [folderId, ...(await getDescendantFolderIds(folderId, db))];

  for (const fid of allFolderIds) {
    const folderPath = await resolveFolderFtpPath(fid, db);
    const filesSnap = await db.collection('files').where('folderId', '==', fid).get();

    await mapWithConcurrencyLimit(filesSnap.docs, 6, async (fileDoc) => {
      const data = fileDoc.data();
      const fileName = data.savedAs || path.posix.basename(data.storagePath || '');
      if (!fileName) return;

      const newStoragePath = folderPath ? `${folderPath}/${fileName}` : fileName;
      const encodedPath = newStoragePath.split('/').map(encodeURIComponent).join('/');

      await fileDoc.ref.update({
        storagePath: newStoragePath,
        url: `/api/files/${encodedPath}`,
        updatedAt: new Date(),
      });
      if (onFileUpdated) onFileUpdated(fileDoc);
    });
  }
}

export { sanitizeName, sanitizeEmail };

/**
 * Builds the FTP storage path for a transcription attachment.
 * Layout: admin/Transcribed/{ownerEmailDir}/{fileId}/{fileName}
 *
 * @param {string} ownerEmail - The email of the file's uploader
 * @param {string} fileName - The transcription file name
 * @param {string} fileId - Firestore file document ID used to keep paths unique
 * @returns {string} FTP path relative to FTP_BASE
 */
export function buildTranscriptionFtpPath(ownerEmail, fileName, fileId = '') {
  const emailDir = sanitizeEmail(ownerEmail);
  const fileDir = sanitizeName(fileId || 'transcription');
  const safeName = path.posix.basename(String(fileName || 'transcription').replace(/\0/g, '')) || 'transcription';
  return `admin/Transcribed/${emailDir}/${fileDir}/${safeName}`;
}
