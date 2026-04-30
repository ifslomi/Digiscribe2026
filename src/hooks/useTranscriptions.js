import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function useTranscriptions() {
  const { getIdToken } = useAuth();
  const [transcriptions, setTranscriptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTranscriptions = useCallback(async (filters = {}) => {
    setLoading(true);
    setError(null);
    try {
      const token = await getIdToken();
      const params = new URLSearchParams();
      if (filters.fileId) params.set('fileId', filters.fileId);
      if (filters.search) params.set('search', filters.search);

      const res = await fetch(`/api/transcriptions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch transcriptions.');
      }
      setTranscriptions(data.transcriptions);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  const createTranscription = useCallback(async ({ fileId, content, title }) => {
    const token = await getIdToken();
    const res = await fetch('/api/transcriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ fileId, content, title }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to create transcription.');
    }
    return data.transcriptionId;
  }, [getIdToken]);

  const updateTranscription = useCallback(async (id, { content, title, note }) => {
    const token = await getIdToken();
    const payload = {};
    if (content !== undefined) payload.content = content;
    if (title !== undefined) payload.title = title;
    if (note !== undefined) payload.note = note;
    const res = await fetch(`/api/transcriptions/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to update transcription.');
    }
  }, [getIdToken]);

  const deleteTranscription = useCallback(async (id) => {
    const token = await getIdToken();
    const res = await fetch(`/api/transcriptions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to delete transcription.');
    }
  }, [getIdToken]);

  const uploadDeliveryFile = useCallback(async ({ fileId, title, file }) => {
    const token = await getIdToken();
    const formData = new FormData();
    formData.append('deliveryFile', file);
    formData.append('fileId', fileId);
    if (title) formData.append('title', title);

    const res = await fetch('/api/transcriptions/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to upload delivery file.');
    }
    return data.transcriptionId;
  }, [getIdToken]);

  return { transcriptions, loading, error, fetchTranscriptions, createTranscription, updateTranscription, deleteTranscription, uploadDeliveryFile };
}
