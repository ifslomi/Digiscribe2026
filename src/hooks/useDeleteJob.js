import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const POLL_INTERVAL_MS = 500;

export function useDeleteJob(storageKey) {
  const { getIdToken } = useAuth();
  const [job, setJob] = useState(null);
  const pollTimerRef = useRef(null);
  const pendingRef = useRef(null);
  const jobIdRef = useRef('');

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const clearStoredJob = useCallback(() => {
    if (typeof window === 'undefined' || !storageKey) return;
    window.localStorage.removeItem(storageKey);
  }, [storageKey]);

  const storeJobId = useCallback((jobId) => {
    if (typeof window === 'undefined' || !storageKey) return;
    window.localStorage.setItem(storageKey, jobId);
  }, [storageKey]);

  const fetchJob = useCallback(async (jobId) => {
    const token = await getIdToken();
    const res = await fetch(`/api/delete-jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to fetch delete progress.');
    }
    return data.job;
  }, [getIdToken]);

  const resolveTerminalJob = useCallback((nextJob) => {
    const completion = pendingRef.current;
    pendingRef.current = null;
    stopPolling();
    clearStoredJob();
    setJob(nextJob);
    jobIdRef.current = nextJob?.id || '';

    if (nextJob?.status === 'failed') {
      completion?.reject(new Error(nextJob.error || nextJob.detail || 'Delete failed.'));
    } else {
      completion?.resolve(nextJob);
    }

    setTimeout(() => {
      if (!pendingRef.current && jobIdRef.current === nextJob?.id) {
        setJob(null);
        jobIdRef.current = '';
      }
    }, 1500);
  }, [clearStoredJob, stopPolling]);

  const pollJob = useCallback(async (jobId) => {
    try {
      const nextJob = await fetchJob(jobId);
      if (!nextJob) {
        stopPolling();
        clearStoredJob();
        setJob(null);
        jobIdRef.current = '';
        pendingRef.current?.reject(new Error('Delete job not found.'));
        pendingRef.current = null;
        return;
      }

      setJob(nextJob);
      jobIdRef.current = nextJob.id;

      if (nextJob.status === 'completed' || nextJob.status === 'failed') {
        resolveTerminalJob(nextJob);
      }
    } catch {
      // Keep the last known state and try again on the next tick.
    }
  }, [clearStoredJob, fetchJob, resolveTerminalJob, stopPolling]);

  const startPolling = useCallback((jobId) => {
    stopPolling();
    void pollJob(jobId);
    pollTimerRef.current = setInterval(() => {
      void pollJob(jobId);
    }, POLL_INTERVAL_MS);
  }, [pollJob, stopPolling]);

  const resumeDeleteJob = useCallback((jobId) => {
    if (!jobId) return;
    jobIdRef.current = jobId;
    startPolling(jobId);
  }, [startPolling]);

  const startDeleteJob = useCallback(async ({ fileIds = [], folderIds = [] }) => {
    if (job && job.status !== 'completed' && job.status !== 'failed') {
      throw new Error('A delete is already in progress.');
    }

    const token = await getIdToken();
    const res = await fetch('/api/delete-jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ fileIds, folderIds }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to start delete job.');
    }

    const nextJob = data.job;
    setJob(nextJob);
    jobIdRef.current = nextJob.id;
    storeJobId(nextJob.id);

    return await new Promise((resolve, reject) => {
      pendingRef.current = { resolve, reject };
      startPolling(nextJob.id);
    });
  }, [getIdToken, job?.status, startPolling, storeJobId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !storageKey) return undefined;
    const storedJobId = window.localStorage.getItem(storageKey);
    if (storedJobId) {
      resumeDeleteJob(storedJobId);
    }
    return () => {
      stopPolling();
    };
  }, [resumeDeleteJob, storageKey, stopPolling]);

  return {
    job,
    isRunning: job?.status === 'running' || job?.status === 'queued',
    startDeleteJob,
    resumeDeleteJob,
    clearDeleteJob: () => {
      stopPolling();
      pendingRef.current = null;
      jobIdRef.current = '';
      clearStoredJob();
      setJob(null);
    },
  };
}