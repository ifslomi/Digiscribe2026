import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { adminDb } from '../firebaseAdmin.js';
import { verifyAuth, verifyAdmin } from '../middleware/authMiddleware.js';
import { uploadToFtp, deleteFromFtp } from '../services/ftp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IS_VERCEL = !!process.env.VERCEL;
// Temporary staging directory for incoming delivery file uploads
const deliveryTmpDir = IS_VERCEL ? '/tmp/_deliveries' : path.join(__dirname, '..', 'chunks', '_deliveries');
if (!fs.existsSync(deliveryTmpDir)) fs.mkdirSync(deliveryTmpDir, { recursive: true });

const deliveryUpload = multer({
  storage: multer.diskStorage({
    destination: deliveryTmpDir,
    filename: (req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safeName}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/') || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only media files (audio, video, image) are accepted for transcription delivery.'));
    }
  },
});

const router = Router();

// POST /api/transcriptions - Create a text-based transcription for a file
router.post('/', verifyAdmin, async (req, res) => {
  const { fileId, content, title } = req.body;

  if (!fileId || !content) {
    return res.status(400).json({ success: false, error: 'fileId and content are required.' });
  }

  try {
    const fileDoc = await adminDb.collection('files').doc(fileId).get();
    if (!fileDoc.exists) {
      return res.status(404).json({ success: false, error: 'File not found.' });
    }

    const fileData = fileDoc.data();
    const now = new Date();
    const docRef = await adminDb.collection('transcriptions').add({
      fileId,
      content,
      title: title || '',
      fileName: fileData.originalName || '',
      fileType: fileData.type || '',
      createdBy: req.user.uid,
      createdByEmail: req.user.email || '',
      createdAt: now,
      updatedAt: now,
      updatedBy: req.user.uid,
      updatedByEmail: req.user.email || '',
      uploadedBy: fileData.uploadedBy || '',
      deliveryType: 'text',
      deliveryFileName: null,
      deliveryFileUrl: null,
      deliveryFileSize: null,
    });

    // Update the file status to transcribed
    await adminDb.collection('files').doc(fileId).update({
      status: 'transcribed',
      updatedAt: now,
    });

    res.json({ success: true, transcriptionId: docRef.id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/transcriptions/upload - File-based transcription delivery
router.post('/upload', verifyAdmin, deliveryUpload.single('deliveryFile'), async (req, res) => {
  const { fileId, title } = req.body;

  if (!fileId) {
    return res.status(400).json({ success: false, error: 'fileId is required.' });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No delivery file uploaded.' });
  }

  try {
    const fileDoc = await adminDb.collection('files').doc(fileId).get();
    if (!fileDoc.exists) {
      return res.status(404).json({ success: false, error: 'File not found.' });
    }
    const fileData = fileDoc.data();

    const now = new Date();
    // FTP path: _deliveries/filename (relative to FTP_BASE)
    const deliveryPath = `_deliveries/${path.basename(req.file.path)}`;

    // Upload to FTP, then remove local temp file
    await uploadToFtp(req.file.path, deliveryPath);
    fs.unlinkSync(req.file.path);

    const docRef = await adminDb.collection('transcriptions').add({
      fileId,
      content: '',
      title: title || '',
      fileName: fileData.originalName || '',
      fileType: fileData.type || '',
      createdBy: req.user.uid,
      createdByEmail: req.user.email || '',
      createdAt: now,
      updatedAt: now,
      updatedBy: req.user.uid,
      updatedByEmail: req.user.email || '',
      uploadedBy: fileData.uploadedBy || '',
      deliveryType: 'file',
      deliveryFileName: req.file.originalname,
      deliveryFileUrl: `/api/files/${encodeURIComponent(deliveryPath)}`,
      deliveryFileSize: req.file.size,
    });

    // Update file status to transcribed
    await adminDb.collection('files').doc(fileId).update({
      status: 'transcribed',
      updatedAt: now,
    });

    res.json({ success: true, transcriptionId: docRef.id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/transcriptions - List transcriptions (role-scoped)
router.get('/', verifyAuth, async (req, res) => {
  try {
    const { fileId, search } = req.query;
    let query = adminDb.collection('transcriptions');

    const role = req.user.role;

    if (role === 'admin') {
      // Admin sees all transcriptions
    } else {
      // Regular users see transcriptions for files they uploaded
      query = query.where('uploadedBy', '==', req.user.uid);
    }

    if (fileId) {
      query = query.where('fileId', '==', fileId);
    }

    const snapshot = await query.get();
    let transcriptions = await Promise.all(snapshot.docs.map(async (doc) => {
      const data = doc.data();

      let fileDescription = '';
      if (data.fileId) {
        const fileDoc = await adminDb.collection('files').doc(data.fileId).get();
        if (fileDoc.exists) {
          fileDescription = fileDoc.data().description || '';
        }
      }

      const note = data.description || data.note || fileDescription || '';

      return {
        id: doc.id,
        ...data,
        note,
        fileDescription,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
      };
    }));

    transcriptions.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    // Client-side text search (Firestore doesn't support full-text search)
    if (search) {
      const searchLower = search.toLowerCase();
      transcriptions = transcriptions.filter((t) =>
        t.title?.toLowerCase().includes(searchLower) ||
        t.content?.toLowerCase().includes(searchLower) ||
        t.fileName?.toLowerCase().includes(searchLower) ||
        t.note?.toLowerCase().includes(searchLower) ||
        t.fileDescription?.toLowerCase().includes(searchLower)
      );
    }

    res.json({ success: true, transcriptions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/transcriptions/:id - Get a single transcription
router.get('/:id', verifyAuth, async (req, res) => {
  try {
    const docRef = adminDb.collection('transcriptions').doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Transcription not found.' });
    }

    const data = doc.data();
    const role = req.user.role;

    // Access check: regular users can only see their own transcriptions
    if (role === 'user' && data.uploadedBy !== req.user.uid) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    let fileDescription = '';
    if (data.fileId) {
      const fileDoc = await adminDb.collection('files').doc(data.fileId).get();
      if (fileDoc.exists) {
        fileDescription = fileDoc.data().description || '';
      }
    }

    const note = data.description || data.note || fileDescription || '';

    res.json({
      success: true,
      transcription: {
        id: doc.id,
        ...data,
        note,
        fileDescription,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/transcriptions/:id - Update a transcription
router.put('/:id', verifyAdmin, async (req, res) => {
  const { content, title } = req.body;

  try {
    const docRef = adminDb.collection('transcriptions').doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Transcription not found.' });
    }

    const updates = {
      updatedAt: new Date(),
      updatedBy: req.user.uid,
      updatedByEmail: req.user.email || '',
    };
    if (content !== undefined) updates.content = content;
    if (title !== undefined) updates.title = title;

    await docRef.update(updates);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/transcriptions/:id - Delete a transcription (admin only)
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const docRef = adminDb.collection('transcriptions').doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Transcription not found.' });
    }

    const data = doc.data();
    // Delete delivery file from FTP if present
    if (data.deliveryType === 'file' && data.deliveryFileUrl) {
      // deliveryFileUrl is like /api/files/_deliveries/filename — extract the remote path
      const match = data.deliveryFileUrl.match(/^\/api\/files\/(.+)$/);
      if (match) {
        await deleteFromFtp(decodeURIComponent(match[1]));
      }
    }

    await docRef.delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
