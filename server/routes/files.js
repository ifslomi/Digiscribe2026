import { Router } from 'express';
import multer from 'multer';
import { adminDb } from '../firebaseAdmin.js';
import { verifyAuth } from '../middleware/authMiddleware.js';
import { deleteFromFtp, moveOnFtp, uploadBufferToFtp } from '../services/ftp.js';
import { computeFileFtpPath, buildTranscriptionFtpPath } from '../services/ftpPathResolver.js';
import path from 'path';

const router = Router();
const transcriptionUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const MAX_TRANSCRIPTION_SIZE_BYTES = 50 * 1024 * 1024;
const ALLOWED_TRANSCRIPTION_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
]);
const ALLOWED_TRANSCRIPTION_EXTENSIONS = new Set([
  '.pdf', '.txt', '.csv', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.rtf', '.odt',
]);
const TRANSCRIPTION_FORMAT_ERROR = 'Unsupported transcription format. Only PDF, TXT/CSV, DOC/DOCX, XLS/XLSX, PPT/PPTX, RTF, and ODT are allowed.';

function isAllowedTranscriptionFormat(mimeType, fileName) {
  const normalizedMime = typeof mimeType === 'string' ? mimeType.toLowerCase().trim() : '';
  if (normalizedMime && ALLOWED_TRANSCRIPTION_MIME_TYPES.has(normalizedMime)) return true;
  const ext = path.posix.extname(String(fileName || '')).toLowerCase();
  if (ext && ALLOWED_TRANSCRIPTION_EXTENSIONS.has(ext)) return true;
  return false;
}

// POST /api/files/metadata - Save file metadata
router.post('/metadata', verifyAuth, async (req, res) => {
  const { originalName, savedAs, size, type, description, serviceCategory, sourceType, sourceUrl, folderId } = req.body;

  if (!originalName || !savedAs) {
    return res.status(400).json({ success: false, error: 'Missing required fields.' });
  }

  try {
    const docRef = await adminDb.collection('files').add({
      originalName,
      savedAs,
      size: size || 0,
      type: type || 'application/octet-stream',
      uploadedBy: req.user.uid,
      uploadedByEmail: req.user.email || '',
      uploaderUid: req.user.uid,
      uploaderEmail: req.user.email || '',
      uploadedByAdmin: req.user.role === 'admin',
      uploadedAt: new Date(),
      status: 'pending',
      description: description || '',
      serviceCategory: serviceCategory || '',
      sourceType: sourceType || 'file',
      sourceUrl: sourceUrl || null,
      folderId: folderId || null,
      url: `/api/files/${encodeURIComponent(savedAs)}`,
    });

    res.json({ success: true, fileId: docRef.id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/files/metadata - List files (role-scoped)
router.get('/metadata', verifyAuth, async (req, res) => {
  try {
    const { status } = req.query;
    let query = adminDb.collection('files');

    const role = req.user.role;

    if (role === 'admin') {
      // Admin sees all files
    } else {
      // Regular users see only their own files
      query = query.where('uploadedBy', '==', req.user.uid);
    }

    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.get();
    const files = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      uploadedAt: doc.data().uploadedAt?.toDate?.()?.toISOString() || doc.data().uploadedAt,
    })).sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));

    res.json({ success: true, files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/files/metadata/:fileId/status - Update file status (admin only)
router.put('/metadata/:fileId/status', verifyAuth, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'in-progress', 'transcribed'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    const docRef = adminDb.collection('files').doc(req.params.fileId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'File not found.' });
    }

    // Only admins can change status
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required to change status.' });
    }

    await docRef.update({ status, updatedAt: new Date() });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/files/metadata/:fileId/description - Update file description/note
router.put('/metadata/:fileId/description', verifyAuth, async (req, res) => {
  const { description } = req.body;
  const nextDescription = typeof description === 'string' ? description.trim() : '';

  if (nextDescription.length > 2000) {
    return res.status(400).json({ success: false, error: 'Description must be 2000 characters or less.' });
  }

  try {
    const docRef = adminDb.collection('files').doc(req.params.fileId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'File not found.' });
    }

    const fileData = doc.data();

    // Users can update only their own non-admin-uploaded files; admins can update any file.
    if (req.user.role !== 'admin' && (fileData.uploadedBy !== req.user.uid || fileData.uploadedByAdmin)) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    await docRef.set({ description: nextDescription, updatedAt: new Date() }, { merge: true });
    res.json({ success: true, description: nextDescription });
  } catch (err) {
    console.error('[files/description] update failed', {
      fileId: req.params.fileId,
      userUid: req.user?.uid || '',
      userRole: req.user?.role || '',
      error: err.message,
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/files/metadata/:fileId/folder - Move file to folder
router.put('/metadata/:fileId/folder', verifyAuth, async (req, res) => {
  const { folderId } = req.body;

  try {
    const docRef = adminDb.collection('files').doc(req.params.fileId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'File not found.' });
    }

    const fileData = doc.data();

    // Regular users can only move their own files
    if (req.user.role !== 'admin' && fileData.uploadedBy !== req.user.uid) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    // If folderId specified, verify the folder exists
    if (folderId) {
      const folderDoc = await adminDb.collection('folders').doc(folderId).get();
      if (!folderDoc.exists) {
        return res.status(404).json({ success: false, error: 'Folder not found.' });
      }
    }

    // --- FTP sync: move file to the new folder path ---
    const oldStoragePath = fileData.storagePath || fileData.savedAs;
    const oldFolderId = fileData.folderId || null;
    const newFolderId = folderId || null;

    // Only move on FTP if folder actually changed
    if (oldFolderId !== newFolderId && oldStoragePath) {
      try {
        const newStoragePath = await computeFileFtpPath(fileData, newFolderId, adminDb);

        if (oldStoragePath !== newStoragePath) {
          await moveOnFtp(oldStoragePath, newStoragePath);
        }

        const encodedPath = newStoragePath.split('/').map(encodeURIComponent).join('/');
        await docRef.update({
          folderId: newFolderId,
          storagePath: newStoragePath,
          url: `/api/files/${encodedPath}`,
          updatedAt: new Date(),
        });
      } catch (ftpErr) {
        console.warn('[ftp] move-to-folder warning:', ftpErr.message);
        // Still update Firestore folderId even if FTP move fails
        await docRef.update({ folderId: newFolderId, updatedAt: new Date() });
      }
    } else {
      await docRef.update({ folderId: newFolderId, updatedAt: new Date() });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/files/metadata/:fileId/rename - Rename file display name
router.put('/metadata/:fileId/rename', verifyAuth, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Name is required.' });
  }
  try {
    const docRef = adminDb.collection('files').doc(req.params.fileId);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'File not found.' });
    }

    const fileData = doc.data();

    // Non-admins can only rename their own files
    if (req.user.role !== 'admin' && fileData.uploadedBy !== req.user.uid) {
      return res.status(403).json({ success: false, error: 'You can only rename your own files.' });
    }

    const oldStoragePath = fileData.storagePath || fileData.savedAs;
    const newDisplayName = name.trim();

    // --- FTP sync: rename the file on FTP ---
    if (oldStoragePath) {
      try {
        const dir = path.posix.dirname(oldStoragePath);
        const oldBaseName = path.posix.basename(oldStoragePath);
        // Preserve the unique timestamp prefix from savedAs, change the display portion
        const ext = path.posix.extname(oldBaseName);
        // savedAs is like "1234567890-original_name.mp3"
        const savedAs = fileData.savedAs || oldBaseName;
        const dashIndex = savedAs.indexOf('-');
        const prefix = dashIndex > 0 ? savedAs.slice(0, dashIndex + 1) : `${Date.now()}-`;
        const safeName = newDisplayName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const newFileName = `${prefix}${safeName}`;
        // Only add extension if safeName doesn't already end with it
        const finalNewFileName = safeName.toLowerCase().endsWith(ext.toLowerCase()) ? newFileName : newFileName;
        const newStoragePath = `${dir}/${finalNewFileName}`;

        if (oldStoragePath !== newStoragePath) {
          await moveOnFtp(oldStoragePath, newStoragePath);
          const encodedPath = newStoragePath.split('/').map(encodeURIComponent).join('/');
          await docRef.update({
            originalName: newDisplayName,
            savedAs: finalNewFileName,
            storagePath: newStoragePath,
            url: `/api/files/${encodedPath}`,
            updatedAt: new Date(),
          });
        } else {
          await docRef.update({ originalName: newDisplayName, updatedAt: new Date() });
        }
      } catch (ftpErr) {
        console.warn('[ftp] rename warning:', ftpErr.message);
        // Still update display name even if FTP rename fails
        await docRef.update({ originalName: newDisplayName, updatedAt: new Date() });
      }
    } else {
      await docRef.update({ originalName: newDisplayName, updatedAt: new Date() });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/files/metadata/:fileId - Delete file metadata and uploaded file
router.delete('/metadata/:fileId', verifyAuth, async (req, res) => {
  try {
    const docRef = adminDb.collection('files').doc(req.params.fileId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'File not found.' });
    }

    const fileData = doc.data();

    // Non-admins can only delete their own files
    if (req.user.role !== 'admin' && fileData.uploadedBy !== req.user.uid) {
      return res.status(403).json({ success: false, error: 'You can only delete your own files.' });
    }

    // Delete the file and any attached transcription from FTP in parallel.
    const deleteTasks = [];
    const remotePath = fileData.storagePath || fileData.savedAs;
    if (remotePath) {
      deleteTasks.push(deleteFromFtp(remotePath));
    }
    if (fileData.transcriptionStoragePath) {
      deleteTasks.push(
        deleteFromFtp(fileData.transcriptionStoragePath).catch((e) => {
          console.warn('[delete] Failed to clean up transcription:', e.message);
        })
      );
    }

    await Promise.all(deleteTasks);

    // Delete the Firestore document
    await docRef.delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/files/metadata/:fileId/transcription - Attach transcription file (admin only)
router.post('/metadata/:fileId/transcription', verifyAuth, transcriptionUpload.single('transcription'), async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No transcription file provided.' });
  }
  if (!isAllowedTranscriptionFormat(req.file.mimetype, req.file.originalname)) {
    return res.status(400).json({ success: false, error: TRANSCRIPTION_FORMAT_ERROR });
  }

  try {
    const docRef = adminDb.collection('files').doc(req.params.fileId);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'File not found.' });
    }

    const fileData = doc.data();
    const ownerEmail = fileData.uploadedByEmail || 'unknown';
    const transcriptionFileName = path.basename(req.file.originalname || 'transcription');
    const ftpPath = buildTranscriptionFtpPath(ownerEmail, transcriptionFileName, req.params.fileId);

    // If a previous transcription exists, delete it from FTP
    if (fileData.transcriptionStoragePath) {
      try {
        await deleteFromFtp(fileData.transcriptionStoragePath);
      } catch (e) {
        console.warn('[transcription] Failed to delete old transcription from FTP:', e.message);
      }
    }

    // Upload new transcription to FTP
    await uploadBufferToFtp(req.file.buffer, ftpPath);

    // Build the URL for serving
    const encodedPath = ftpPath.split('/').map(encodeURIComponent).join('/');
    const transcriptionUrl = `/api/files/${encodedPath}`;

    // Update Firestore
    await docRef.update({
      transcriptionUrl,
      transcriptionName: transcriptionFileName,
      transcriptionStoragePath: ftpPath,
      transcriptionSize: req.file.size,
      transcriptionType: req.file.mimetype || 'application/octet-stream',
      transcriptionAttachedAt: new Date(),
      status: 'transcribed',
      updatedAt: new Date(),
    });

    res.json({
      success: true,
      transcriptionUrl,
      transcriptionName: transcriptionFileName,
      transcriptionSize: req.file.size,
    });
  } catch (err) {
    console.error('[transcription] upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/files/metadata/:fileId/transcription - Remove transcription attachment (admin only)
router.delete('/metadata/:fileId/transcription', verifyAuth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }

  try {
    const docRef = adminDb.collection('files').doc(req.params.fileId);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'File not found.' });
    }

    const fileData = doc.data();

    // Delete from FTP
    if (fileData.transcriptionStoragePath) {
      try {
        await deleteFromFtp(fileData.transcriptionStoragePath);
      } catch (e) {
        console.warn('[transcription] Failed to delete from FTP:', e.message);
      }
    }

    // Clear transcription fields
    const { FieldValue } = await import('firebase-admin/firestore');
    await docRef.update({
      transcriptionUrl: FieldValue.delete(),
      transcriptionName: FieldValue.delete(),
      transcriptionStoragePath: FieldValue.delete(),
      transcriptionSize: FieldValue.delete(),
      transcriptionType: FieldValue.delete(),
      transcriptionAttachedAt: FieldValue.delete(),
      updatedAt: new Date(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[transcription] delete error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
