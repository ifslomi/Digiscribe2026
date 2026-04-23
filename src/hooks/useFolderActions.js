import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function useFolderActions() {
  const { getIdToken, user } = useAuth();

  const createFolder = useCallback(async (name, parentId = null, targetOwnerEmail = null) => {
    const token = await getIdToken();
    let normalizedTargetOwnerEmail = targetOwnerEmail ? String(targetOwnerEmail).trim() : '';

    // Fallback: recover active per-user scope from persisted admin dashboard state.
    if (!normalizedTargetOwnerEmail && typeof window !== 'undefined') {
      try {
        const stateKey = `admin-dashboard-files-state-v1:${user?.uid || 'admin'}`;
        const raw = window.localStorage.getItem(stateKey);
        if (raw) {
          const state = JSON.parse(raw);
          const recovered = String(state?.selectedUserEmail || '').trim();
          if (recovered) normalizedTargetOwnerEmail = recovered;
        }
      } catch {
        // Ignore malformed localStorage state.
      }
    }

    console.log('[folders/create-request]', {
      actorEmail: user?.email || '',
      actorUid: user?.uid || '',
      parentId: parentId || null,
      targetOwnerEmail: normalizedTargetOwnerEmail || '',
    });

    const query = normalizedTargetOwnerEmail ? `?targetOwnerEmail=${encodeURIComponent(normalizedTargetOwnerEmail)}` : '';
    const res = await fetch(`/api/folders${query}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(normalizedTargetOwnerEmail ? { 'x-target-owner-email': normalizedTargetOwnerEmail } : {}),
      },
      body: JSON.stringify({
        name,
        parentId,
        targetOwnerEmail: normalizedTargetOwnerEmail || null,
        ownerEmail: normalizedTargetOwnerEmail || null,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create folder.');
    return data.folderId;
  }, [getIdToken, user?.uid]);

  const renameFolder = useCallback(async (folderId, name) => {
    const token = await getIdToken();
    const res = await fetch(`/api/folders/${folderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to rename folder.');
  }, [getIdToken]);

  const moveFolder = useCallback(async (folderId, newParentId) => {
    const token = await getIdToken();
    const res = await fetch(`/api/folders/${folderId}/move`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ parentId: newParentId }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to move folder.');
  }, [getIdToken]);

  const deleteFolder = useCallback(async (folderId) => {
    const token = await getIdToken();
    const res = await fetch(`/api/folders/${folderId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete folder.');
  }, [getIdToken]);

  const moveFileToFolder = useCallback(async (fileId, folderId) => {
    const token = await getIdToken();
    const res = await fetch(`/api/files/metadata/${fileId}/folder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ folderId }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to move file.');
  }, [getIdToken]);

  return { createFolder, renameFolder, moveFolder, deleteFolder, moveFileToFolder };
}
