import { randomUUID } from 'crypto';
import { adminDb } from '../firebaseAdmin.js';
import { deleteFromFtp, moveOnFtp, removeDirOnFtp } from './ftp.js';
import { computeFileFtpPath, getDescendantFolderIds, resolveFolderFtpPath, updateDescendantFilePaths } from './ftpPathResolver.js';
import { mapWithConcurrencyLimit } from './concurrency.js';

const deleteJobs = new Map();
const JOB_RETENTION_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - JOB_RETENTION_MS;
  for (const [jobId, job] of deleteJobs) {
    const finishedAt = job.completedAt ? new Date(job.completedAt).getTime() : 0;
    if ((job.status === 'completed' || job.status === 'failed') && finishedAt && finishedAt < cutoff) {
      deleteJobs.delete(jobId);
    }
  }
}, CLEANUP_INTERVAL_MS);

if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();

function nowIso() {
  return new Date().toISOString();
}

function cloneJob(job) {
  if (!job) return null;
  return {
    ...job,
    fileIds: [...job.fileIds],
    folderIds: [...job.folderIds],
    summary: { ...job.summary },
    progress: { ...job.progress },
  };
}

function buildProgress(job) {
  const total = Math.max(0, Number(job.totalUnits) || 0);
  const completed = Math.max(0, Number(job.completedUnits) || 0);
  const percent = total > 0 ? Math.min(100, (completed / total) * 100) : 0;
  const startedAt = job.startedAt ? new Date(job.startedAt).getTime() : 0;
  const elapsedMs = startedAt ? Math.max(0, Date.now() - startedAt) : 0;
  let etaMs = null;

  if (completed > 0 && total > completed) {
    const perUnitMs = elapsedMs / completed;
    etaMs = Math.max(0, Math.round(perUnitMs * (total - completed)));
  }

  return { total, completed, percent, elapsedMs, etaMs, phase: job.phase || '', detail: job.detail || '' };
}

function touchJob(jobId, patch = {}) {
  const job = deleteJobs.get(jobId);
  if (!job) return null;

  Object.assign(job, patch, { updatedAt: nowIso() });
  job.progress = buildProgress(job);
  return cloneJob(job);
}

function addTotal(jobId, amount, patch = {}) {
  const job = deleteJobs.get(jobId);
  if (!job || !amount) return null;

  job.totalUnits += amount;
  Object.assign(job, patch, { updatedAt: nowIso() });
  job.progress = buildProgress(job);
  return cloneJob(job);
}

function advance(jobId, amount = 1, patch = {}) {
  const job = deleteJobs.get(jobId);
  if (!job || !amount) return null;

  job.completedUnits += amount;
  Object.assign(job, patch, { updatedAt: nowIso() });
  job.progress = buildProgress(job);
  return cloneJob(job);
}

async function countFilesInFolderTree(folderId) {
  if (!folderId) return 0;
  const folderIds = [folderId, ...(await getDescendantFolderIds(folderId, adminDb))];
  let total = 0;
  for (const fid of folderIds) {
    const filesSnap = await adminDb.collection('files').where('folderId', '==', fid).get();
    total += filesSnap.size;
  }
  return total;
}

async function buildFolderDeleteOrder(rootFolderIds) {
  const folderIds = new Set();

  for (const rootId of rootFolderIds) {
    if (!rootId) continue;
    folderIds.add(rootId);
    const descendants = await getDescendantFolderIds(rootId, adminDb);
    for (const descendantId of descendants) folderIds.add(descendantId);
  }

  const docs = await Promise.all([...folderIds].map(async (folderId) => {
    const doc = await adminDb.collection('folders').doc(folderId).get();
    return doc.exists ? { id: doc.id, data: doc.data() } : null;
  }));

  const folderMap = new Map(docs.filter(Boolean).map((doc) => [doc.id, doc.data]));
  const depthCache = new Map();

  const getDepth = (folderId) => {
    if (depthCache.has(folderId)) return depthCache.get(folderId);
    const folder = folderMap.get(folderId);
    if (!folder || !folder.parentId || !folderMap.has(folder.parentId)) {
      depthCache.set(folderId, 0);
      return 0;
    }
    const depth = 1 + getDepth(folder.parentId);
    depthCache.set(folderId, depth);
    return depth;
  };

  return [...folderIds].filter((folderId) => folderMap.has(folderId)).sort((a, b) => getDepth(b) - getDepth(a));
}

async function deleteSingleFile(fileDoc, user, jobId) {
  const fileData = fileDoc.data();

  if (user.role !== 'admin' && fileData.uploadedBy !== user.uid) {
    advance(jobId, 1, { detail: 'Skipped a file you do not own' });
    return { skipped: true };
  }

  const remotePath = fileData.storagePath || fileData.savedAs;
  if (remotePath) {
    await deleteFromFtp(remotePath);
  }

  if (fileData.transcriptionStoragePath) {
    try {
      await deleteFromFtp(fileData.transcriptionStoragePath);
    } catch (e) {
      console.warn('[delete-job] Failed to clean up transcription:', e.message);
    }
  }

  await fileDoc.ref.delete();
  advance(jobId, 1, { detail: `Deleted ${fileData.originalName || 'file'}` });
  return { skipped: false };
}

async function deleteFolderTree(folderId, user, jobId) {
  const docRef = adminDb.collection('folders').doc(folderId);
  const doc = await docRef.get();

  if (!doc.exists) {
    advance(jobId, 1, { detail: 'Skipped a missing folder' });
    return { skipped: true };
  }

  const folderData = doc.data();

  if (user.role !== 'admin' && folderData.createdBy !== user.uid) {
    advance(jobId, 1, { detail: 'Skipped a folder you do not own' });
    return { skipped: true };
  }

  const newParent = folderData.parentId || null;

  let folderFtpPath = '';
  try {
    folderFtpPath = await resolveFolderFtpPath(folderId, adminDb);
  } catch {
    folderFtpPath = '';
  }

  const filesSnapshot = await adminDb.collection('files').where('folderId', '==', folderId).get();
  addTotal(jobId, filesSnapshot.docs.length, {
    phase: 'Moving files',
    detail: folderData.name || 'Folder',
  });

  await mapWithConcurrencyLimit(filesSnapshot.docs, 6, async (fileDoc) => {
    const fileData = fileDoc.data();
    const oldStoragePath = fileData.storagePath || fileData.savedAs;

    if (oldStoragePath) {
      try {
        const newStoragePath = await computeFileFtpPath(fileData, newParent, adminDb);
        if (oldStoragePath !== newStoragePath) {
          await moveOnFtp(oldStoragePath, newStoragePath);
          const encodedPath = newStoragePath.split('/').map(encodeURIComponent).join('/');
          await fileDoc.ref.update({
            folderId: newParent,
            storagePath: newStoragePath,
            url: `/api/files/${encodedPath}`,
            updatedAt: new Date(),
          });
        } else {
          await fileDoc.ref.update({ folderId: newParent, updatedAt: new Date() });
        }
      } catch (ftpErr) {
        console.warn('[delete-job] folder file-move warning:', ftpErr.message);
        await fileDoc.ref.update({ folderId: newParent, updatedAt: new Date() });
      }
    } else {
      await fileDoc.ref.update({ folderId: newParent, updatedAt: new Date() });
    }

    advance(jobId, 1, {
      phase: 'Moving files',
      detail: folderData.name || 'Folder',
    });
  });

  const subfoldersSnapshot = await adminDb.collection('folders').where('parentId', '==', folderId).get();
  addTotal(jobId, subfoldersSnapshot.docs.length + 1, {
    phase: 'Reparenting folders',
    detail: folderData.name || 'Folder',
  });

  const batch = adminDb.batch();
  subfoldersSnapshot.docs.forEach((subDoc) => {
    batch.update(subDoc.ref, { parentId: newParent, updatedAt: new Date() });
  });
  batch.delete(docRef);
  await batch.commit();

  advance(jobId, subfoldersSnapshot.docs.length + 1, {
    phase: 'Reparenting folders',
    detail: folderData.name || 'Folder',
  });

  for (const subDoc of subfoldersSnapshot.docs) {
    const subtreeCount = await countFilesInFolderTree(subDoc.id);
    addTotal(jobId, subtreeCount, {
      phase: 'Updating nested files',
      detail: subDoc.data().name || 'Subfolder',
    });

    try {
      await updateDescendantFilePaths(subDoc.id, adminDb, () => {
        advance(jobId, 1, {
          phase: 'Updating nested files',
          detail: subDoc.data().name || 'Subfolder',
        });
      });
    } catch (ftpErr) {
      console.warn('[delete-job] folder subfolder-path-update warning:', ftpErr.message);
    }
  }

  if (folderFtpPath) {
    addTotal(jobId, 1, {
      phase: 'Removing folder directory',
      detail: folderData.name || 'Folder',
    });
    try {
      await removeDirOnFtp(folderFtpPath);
    } catch (ftpErr) {
      console.warn('[delete-job] folder rmdir warning:', ftpErr.message);
    }
    advance(jobId, 1, {
      phase: 'Removing folder directory',
      detail: folderData.name || 'Folder',
    });
  }

  return { skipped: false };
}

async function runDeleteJob(jobId) {
  const job = deleteJobs.get(jobId);
  if (!job) return;
  const user = { uid: job.userUid, role: job.userRole };

  touchJob(jobId, {
    status: 'running',
    startedAt: nowIso(),
    phase: 'Preparing delete job',
    detail: 'Gathering items',
  });

  try {
    const fileDocs = await Promise.all(job.fileIds.map(async (fileId) => {
      const doc = await adminDb.collection('files').doc(fileId).get();
      return doc.exists ? doc : null;
    }));

    const validFileDocs = fileDocs.filter(Boolean);
    addTotal(jobId, validFileDocs.length, {
      phase: 'Deleting files',
      detail: validFileDocs.length ? `Deleting ${validFileDocs.length} file${validFileDocs.length !== 1 ? 's' : ''}` : 'No files found',
    });

    if (validFileDocs.length > 0) {
      await mapWithConcurrencyLimit(validFileDocs, 6, async (fileDoc) => {
        const result = await deleteSingleFile(fileDoc, user, jobId);
        if (result.skipped) job.summary.skippedFiles += 1;
        else job.summary.deletedFiles += 1;
      });
    }

    const orderedFolderIds = await buildFolderDeleteOrder(job.folderIds);
    addTotal(jobId, orderedFolderIds.length, {
      phase: 'Deleting folders',
      detail: orderedFolderIds.length ? `Deleting ${orderedFolderIds.length} folder${orderedFolderIds.length !== 1 ? 's' : ''}` : 'No folders found',
    });

    for (const folderId of orderedFolderIds) {
      const result = await deleteFolderTree(folderId, user, jobId);
      if (result.skipped) job.summary.skippedFolders += 1;
      else job.summary.deletedFolders += 1;
    }

    touchJob(jobId, {
      status: 'completed',
      completedAt: nowIso(),
      phase: 'Complete',
      detail: `Deleted ${job.summary.deletedFiles} file${job.summary.deletedFiles === 1 ? '' : 's'} and ${job.summary.deletedFolders} folder${job.summary.deletedFolders === 1 ? '' : 's'}.`,
    });
  } catch (err) {
    touchJob(jobId, {
      status: 'failed',
      completedAt: nowIso(),
      phase: 'Failed',
      detail: err.message || 'Delete job failed.',
      error: err.message || 'Delete job failed.',
    });
  }
}

export function startDeleteJob({ user, fileIds = [], folderIds = [] }) {
  const id = randomUUID();
  const now = nowIso();
  const job = {
    id,
    type: 'delete',
    status: 'queued',
    userUid: user?.uid || '',
    userRole: user?.role || '',
    fileIds: [...new Set((fileIds || []).filter(Boolean))],
    folderIds: [...new Set((folderIds || []).filter(Boolean))],
    summary: {
      deletedFiles: 0,
      deletedFolders: 0,
      skippedFiles: 0,
      skippedFolders: 0,
    },
    phase: 'Preparing delete job',
    detail: 'Gathering items',
    totalUnits: 0,
    completedUnits: 0,
    progress: {
      total: 0,
      completed: 0,
      percent: 0,
      elapsedMs: 0,
      etaMs: null,
      phase: 'Preparing delete job',
      detail: 'Gathering items',
    },
    error: '',
    createdAt: now,
    updatedAt: now,
    startedAt: '',
    completedAt: '',
  };

  deleteJobs.set(id, job);
  void runDeleteJob(id);
  return cloneJob(job);
}

export function getDeleteJob(jobId) {
  return cloneJob(deleteJobs.get(jobId));
}

export function serializeDeleteJob(job) {
  return cloneJob(job);
}