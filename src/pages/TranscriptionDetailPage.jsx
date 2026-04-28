import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fileUrl } from '../lib/fileUrl';
import Layout from '../components/layout/Layout';
import FilePreviewModal from '../components/dashboard/FilePreviewModal';
import { useFirestoreFiles } from '../hooks/useFirestoreFiles';
import { useTranscriptions } from '../hooks/useTranscriptions';
import { useAppToast } from '../hooks/useAppToast';
import { useAuth } from '../contexts/AuthContext';

const STATUS_CONFIG = {
  pending: { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', dot: 'bg-amber-400', icon: 'fa-clock' },
  'in-progress': { label: 'In Progress', bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-200', dot: 'bg-sky-400', icon: 'fa-spinner' },
  transcribed: { label: 'Transcribed', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', dot: 'bg-emerald-400', icon: 'fa-check-circle' },
};

function formatSize(bytes) {
  if (!bytes) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  try {
    const d = new Date(dateStr);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  } catch {
    return '--';
  }
}

function getFileIcon(type) {
  if (!type) return { icon: 'fa-file', bg: 'bg-gray-50', text: 'text-gray-400' };
  if (type.startsWith('image/')) return { icon: 'fa-image', bg: 'bg-violet-50', text: 'text-violet-600' };
  if (type.startsWith('audio/')) return { icon: 'fa-music', bg: 'bg-sky-50', text: 'text-sky-600' };
  if (type.startsWith('video/')) return { icon: 'fa-video', bg: 'bg-rose-50', text: 'text-rose-500' };
  if (type === 'application/pdf') return { icon: 'fa-file-pdf', bg: 'bg-red-50', text: 'text-red-500' };
  if (type.includes('word') || type.includes('document')) return { icon: 'fa-file-word', bg: 'bg-blue-50', text: 'text-blue-500' };
  if (type.includes('sheet') || type.includes('excel')) return { icon: 'fa-file-excel', bg: 'bg-green-50', text: 'text-green-500' };
  return { icon: 'fa-file', bg: 'bg-gray-50', text: 'text-gray-400' };
}

export default function TranscriptionDetailPage() {
  const { fileId } = useParams();
  const { isAdmin, getIdToken } = useAuth();
  const toast = useAppToast();
  const { files, loading: filesLoading, error: filesError } = useFirestoreFiles();
  const {
    transcriptions,
    loading: transcriptionsLoading,
    error: transcriptionsError,
    fetchTranscriptions,
    createTranscription,
    updateTranscription,
    uploadDeliveryFile,
  } = useTranscriptions();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [hasFetchedTranscriptions, setHasFetchedTranscriptions] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState('text'); // 'text' | 'file'
  const [deliveryFile, setDeliveryFile] = useState(null);
  const [noteValue, setNoteValue] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteMessage, setNoteMessage] = useState(null);

  useEffect(() => {
    if (!message) return;
    if (message.type === 'success') {
      toast.success(message.text);
      return;
    }
    toast.error(message.text);
  }, [message, toast]);

  // Find the file matching the route param
  const file = useMemo(() => {
    return files.find((f) => f.id === fileId) || null;
  }, [files, fileId]);

  // Find existing transcription for this file
  const existingTranscription = useMemo(() => {
    return transcriptions.find((t) => t.fileId === fileId) || null;
  }, [transcriptions, fileId]);

  // Set document title
  useEffect(() => {
    const name = file ? file.originalName : 'Transcription';
    document.title = `${name} - Transcription Detail - DigiScribe`;
  }, [file]);

  // Fetch transcriptions for this file when fileId is available
  useEffect(() => {
    if (fileId) {
      (async () => {
        await fetchTranscriptions({ fileId });
        setHasFetchedTranscriptions(true);
      })();
    }
  }, [fileId, fetchTranscriptions]);

  // Populate editor when transcription data loads
  useEffect(() => {
    if (existingTranscription) {
      setTitle(existingTranscription.title || '');
      setContent(existingTranscription.content || '');
    }
  }, [existingTranscription]);

  useEffect(() => {
    setNoteValue(file?.description || '');
    setNoteMessage(null);
  }, [file?.id, file?.description]);

  const handleSaveNote = async () => {
    if (!fileId) return;

    const nextNote = noteValue;
    setNoteSaving(true);
    setNoteMessage(null);

    try {
      const token = await getIdToken();
      const res = await fetch(`/api/files/metadata/${fileId}/description`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ description: nextNote }),
      });

      const raw = await res.text();
      let data = {};
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = { error: raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() };
        }
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to update note (${res.status}).`);
      }

      setNoteValue(data.description ?? nextNote);
      setNoteMessage({ type: 'success', text: 'Note saved.' });
    } catch (err) {
      setNoteMessage({ type: 'error', text: err.message });
    } finally {
      setNoteSaving(false);
    }
  };

  const handleSave = async () => {
    if (deliveryMode === 'file') {
      if (!deliveryFile) {
        setMessage({ type: 'error', text: 'Please select a file to upload.' });
        return;
      }
    } else {
      if (!content.trim() && !title.trim()) {
        setMessage({ type: 'error', text: 'Please enter a title or transcription content before saving.' });
        return;
      }
    }

    setSaving(true);
    setMessage(null);

    try {
      if (deliveryMode === 'file') {
        await uploadDeliveryFile({ fileId, title, file: deliveryFile });
        setMessage({ type: 'success', text: 'Delivery file uploaded successfully.' });
        setDeliveryFile(null);
        await fetchTranscriptions({ fileId });
      } else if (existingTranscription) {
        await updateTranscription(existingTranscription.id, { content, title });
        setMessage({ type: 'success', text: 'Transcription updated successfully.' });
        // Re-fetch to get updated metadata
        await fetchTranscriptions({ fileId });
      } else {
        await createTranscription({ fileId, content, title });
        setMessage({ type: 'success', text: 'Transcription created successfully.' });
        // Re-fetch to get the created transcription ID for subsequent updates
        await fetchTranscriptions({ fileId });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const isLoading = filesLoading || (transcriptionsLoading && !hasFetchedTranscriptions);
  const statusCfg = file ? (STATUS_CONFIG[file.status] || STATUS_CONFIG.pending) : null;
  const fileIcon = file ? getFileIcon(file.type) : null;

  const heroContent = (
    <div className="relative z-10 py-10 pb-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <Link
              to="/admin/transcriptions"
              className="inline-flex items-center gap-1.5 text-sm text-gray-text hover:text-primary transition-colors mb-3"
            >
              <i className="fas fa-arrow-left text-xs"></i>
              Back to Transcriptions
            </Link>
            <h1 className="text-2xl md:text-3xl font-semibold gradient-text">
              {isLoading ? 'Loading...' : file ? 'Transcription Detail' : 'File Not Found'}
            </h1>
            <p className="text-sm text-gray-text mt-1">
              {isLoading
                ? 'Loading file details...'
                : file
                  ? file.originalName
                  : 'The requested file could not be found.'}
            </p>
          </div>
          {file && (
            <Link
              to="/admin/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-text hover:text-dark-text hover:bg-white/80 rounded-xl border border-gray-200 transition-all self-start sm:self-auto"
            >
              <i className="fas fa-th-large text-xs"></i>
              Dashboard
            </Link>
          )}
        </div>
      </div>
    </div>
  );

  // Loading state
  if (isLoading) {
    return (
      <Layout heroContent={heroContent}>
        <div className="min-h-screen bg-[#f8fafc]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="text-center py-24">
              <i className="fas fa-spinner fa-spin text-3xl text-primary mb-4 block"></i>
              <p className="text-sm text-gray-text">Loading file and transcription data...</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // Error state
  if (filesError) {
    return (
      <Layout heroContent={heroContent}>
        <div className="min-h-screen bg-[#f8fafc]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
              <div className="p-4 bg-red-50 rounded-xl border border-red-100 flex items-center gap-3">
                <i className="fas fa-exclamation-circle text-red-500"></i>
                <p className="text-sm text-red-700">{filesError}</p>
              </div>
              <div className="mt-6 text-center">
                <Link
                  to="/admin/transcriptions"
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors"
                >
                  <i className="fas fa-arrow-left text-xs"></i>
                  Back to Transcriptions
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // File not found state
  if (!file) {
    return (
      <Layout heroContent={heroContent}>
        <div className="min-h-screen bg-[#f8fafc]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-file-circle-question text-gray-400 text-2xl"></i>
              </div>
              <p className="text-sm font-medium text-dark-text mb-1">File not found</p>
              <p className="text-xs text-gray-text mb-6">
                The file you are looking for does not exist or you do not have permission to access it.
              </p>
              <Link
                to="/admin/transcriptions"
                className="inline-flex items-center gap-2 btn-gradient text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all"
              >
                <i className="fas fa-arrow-left text-xs"></i>
                Back to Transcriptions
              </Link>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout heroContent={heroContent}>
      <div className="min-h-screen bg-[#f8fafc]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Transcription error banner */}
          {transcriptionsError && (
            <div className="mb-6 p-3 bg-red-50 rounded-xl border border-red-100 flex items-center gap-3">
              <i className="fas fa-exclamation-triangle text-red-500"></i>
              <p className="text-sm font-medium text-red-700">Error loading transcription: {transcriptionsError}</p>
            </div>
          )}

          {/* Split Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Panel - File Info */}
            <div className="lg:col-span-4">
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden sticky top-6">
                {/* File Icon Header */}
                <div className="p-6 pb-4 border-b border-gray-100 bg-gray-50/50">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${fileIcon.bg}`}>
                      <i className={`fas ${fileIcon.icon} text-xl ${fileIcon.text}`}></i>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-semibold text-dark-text truncate" title={file.originalName}>
                        {file.originalName}
                      </h2>
                      <p className="text-xs text-gray-text mt-0.5">{file.type || 'Unknown type'}</p>
                    </div>
                  </div>
                </div>

                {/* File Details */}
                <div className="p-6 space-y-4">
                  {/* Status Badge */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-text uppercase tracking-wide">Status</span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${statusCfg.bg} ${statusCfg.text} border ${statusCfg.border}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`}></span>
                      {statusCfg.label}
                    </span>
                  </div>

                  {/* Size */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-text uppercase tracking-wide">Size</span>
                    <span className="text-sm text-dark-text">{formatSize(file.size)}</span>
                  </div>

                  {/* Upload Date */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-text uppercase tracking-wide">Uploaded</span>
                    <span className="text-sm text-dark-text">{formatDate(file.uploadedAt)}</span>
                  </div>

                  {/* Uploader */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-text uppercase tracking-wide flex-shrink-0">Uploader</span>
                    <span className="text-sm text-dark-text truncate" title={file.uploadedByEmail}>
                      {file.uploadedByEmail || '--'}
                    </span>
                  </div>

                  {/* Service Category */}
                  {file.serviceCategory && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-gray-text uppercase tracking-wide flex-shrink-0">Service</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100">
                        <i className="fas fa-tag text-[8px] text-indigo-400"></i>
                        {file.serviceCategory}
                      </span>
                    </div>
                  )}

                  {/* Description */}
                  {file.description && (
                    <div className="pt-2 border-t border-gray-100">
                      <span className="text-xs font-medium text-gray-text uppercase tracking-wide block mb-1.5">Description</span>
                      <p className="text-sm text-dark-text leading-relaxed">{file.description}</p>
                    </div>
                  )}

                  {/* Source URL */}
                  {file.sourceUrl && (
                    <div className="pt-2 border-t border-gray-100">
                      <span className="text-xs font-medium text-gray-text uppercase tracking-wide block mb-1.5">Source URL</span>
                      <a
                        href={file.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:text-primary-dark transition-colors truncate block"
                        title={file.sourceUrl}
                      >
                        <i className="fas fa-external-link-alt text-[10px] mr-1"></i>
                        {file.sourceUrl}
                      </a>
                    </div>
                  )}

                </div>

                {/* Actions */}
                <div className="p-6 pt-2 space-y-3">
                  <button
                    onClick={() => setPreviewFile(file)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 btn-gradient text-white text-sm font-semibold rounded-xl shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all"
                  >
                    <i className="fas fa-eye text-xs"></i>
                    Preview File
                  </button>
                  {file.url && (
                    <a
                      href={fileUrl(file.url)}
                      download={file.originalName}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 text-sm font-medium text-dark-text rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      <i className="fas fa-download text-xs text-gray-400"></i>
                      Download File
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Right Panel - Transcription Editor */}
            <div className="lg:col-span-8">
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                {/* Editor Header */}
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <i className="fas fa-pen-fancy text-primary text-sm"></i>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-dark-text">
                          {existingTranscription ? 'Edit Transcription' : 'New Transcription'}
                        </h3>
                        <p className="text-[11px] text-gray-text mt-0.5">
                          {existingTranscription
                            ? 'Update the existing transcription for this file.'
                            : 'Create a new transcription for this file.'}
                        </p>
                      </div>
                    </div>
                    {existingTranscription && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-600 border border-emerald-100">
                        <i className="fas fa-check-circle text-[9px]"></i>
                        Saved
                      </span>
                    )}
                  </div>
                </div>

                {/* Editor Body */}
                <div className="p-6 space-y-5">
                  {/* Delivery Mode Toggle */}
                  <div className="flex items-center gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => setDeliveryMode('text')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        deliveryMode === 'text'
                          ? 'btn-gradient text-white shadow-md shadow-primary/30'
                          : 'bg-gray-100 text-gray-text hover:bg-gray-200'
                      }`}
                    >
                      <i className="fas fa-keyboard mr-2 text-xs"></i>
                      Text Content
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryMode('file')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        deliveryMode === 'file'
                          ? 'btn-gradient text-white shadow-md shadow-primary/30'
                          : 'bg-gray-100 text-gray-text hover:bg-gray-200'
                      }`}
                    >
                      <i className="fas fa-file-upload mr-2 text-xs"></i>
                      File Upload
                    </button>
                  </div>

                  {/* Title Input */}
                  <div>
                    <label htmlFor="transcription-title" className="block text-xs font-semibold text-gray-text uppercase tracking-wide mb-2">
                      Title
                    </label>
                    <input
                      id="transcription-title"
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Enter transcription title..."
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-dark-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                    />
                  </div>

                  {/* Content Textarea or File Upload */}
                  {deliveryMode === 'text' ? (
                  <div>
                    <label htmlFor="transcription-content" className="block text-xs font-semibold text-gray-text uppercase tracking-wide mb-2">
                      Transcription Content
                    </label>
                    <textarea
                      id="transcription-content"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="Enter or paste transcription content here..."
                      rows={20}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-dark-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all resize-y min-h-[300px] font-mono leading-relaxed"
                    />
                  </div>
                  ) : (
                  <div className="space-y-3">
                    <label className="block">
                      <div className="flex items-center justify-center w-full px-4 py-8 border-2 border-dashed border-gray-200 rounded-xl hover:border-primary/40 transition-colors cursor-pointer bg-gray-50/50">
                        <div className="text-center">
                          <i className="fas fa-cloud-upload-alt text-2xl text-gray-300 mb-2 block"></i>
                          <p className="text-sm text-gray-text">
                            {deliveryFile ? deliveryFile.name : 'Click to select a media file'}
                          </p>
                          {deliveryFile && (
                            <p className="text-xs text-gray-400 mt-1">
                              {(deliveryFile.size / (1024 * 1024)).toFixed(2)} MB
                            </p>
                          )}
                        </div>
                        <input
                          type="file"
                          accept="audio/*,video/*,image/*"
                          className="hidden"
                          onChange={(e) => setDeliveryFile(e.target.files[0] || null)}
                        />
                      </div>
                    </label>
                    {deliveryFile && (
                      <button
                        type="button"
                        onClick={() => setDeliveryFile(null)}
                        className="text-sm text-red-500 hover:text-red-600 transition-colors"
                      >
                        <i className="fas fa-times mr-1 text-xs"></i>
                        Remove file
                      </button>
                    )}
                  </div>
                  )}

                  {/* Save Button */}
                  <div className="flex items-center justify-between gap-4 pt-2">
                    <div className="text-xs text-gray-text">
                      {content.length > 0 && (
                        <span>
                          <i className="fas fa-font text-[10px] mr-1"></i>
                          {content.length.toLocaleString()} characters
                        </span>
                      )}
                    </div>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="inline-flex items-center gap-2 btn-gradient text-white px-6 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? (
                        <>
                          <i className="fas fa-spinner fa-spin text-xs"></i>
                          {deliveryMode === 'file' ? 'Uploading...' : 'Saving...'}
                        </>
                      ) : deliveryMode === 'file' ? (
                        <>
                          <i className="fas fa-cloud-upload-alt text-xs"></i>
                          Upload & Deliver
                        </>
                      ) : existingTranscription ? (
                        <>
                          <i className="fas fa-save text-xs"></i>
                          Update Transcription
                        </>
                      ) : (
                        <>
                          <i className="fas fa-plus text-xs"></i>
                          Create Transcription
                        </>
                      )}
                    </button>
                  </div>

                  {/* Shared Note */}
                  <div className="rounded-2xl border border-gray-100 bg-amber-50/30 p-4">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <h4 className="text-sm font-semibold text-dark-text">Note</h4>
                        <p className="text-[11px] text-gray-text mt-0.5">
                          Shared with the file owner and shown on the transcription view.
                        </p>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={handleSaveNote}
                          disabled={noteSaving || noteValue.trim() === (file?.description || '').trim()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-white bg-primary hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {noteSaving ? (
                            <i className="fas fa-spinner fa-spin text-[10px]"></i>
                          ) : (
                            <i className="fas fa-save text-[10px]"></i>
                          )}
                          Save Note
                        </button>
                      )}
                    </div>

                    {isAdmin ? (
                      <textarea
                        value={noteValue}
                        onChange={(e) => setNoteValue(e.target.value)}
                        placeholder="Add a note for the file owner..."
                        maxLength={2000}
                        rows={4}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-dark-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all resize-y min-h-[120px]"
                      />
                    ) : (
                      <div className="rounded-xl border border-gray-100 bg-white px-4 py-3">
                        {noteValue.trim() ? (
                          <p className="text-sm text-dark-text whitespace-pre-wrap leading-relaxed">{noteValue}</p>
                        ) : (
                          <p className="text-sm text-gray-400 italic">No note provided.</p>
                        )}
                      </div>
                    )}

                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-[11px] text-gray-400">{noteValue.length}/2000</span>
                      {noteMessage && (
                        <span className={`text-[11px] ${noteMessage.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
                          {noteMessage.text}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Transcription Metadata Footer */}
                {existingTranscription && (
                  <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/30">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex items-center gap-2 text-xs text-gray-text">
                        <i className="fas fa-user-pen text-[10px] text-gray-300"></i>
                        <span>Created by: <span className="font-medium text-dark-text">{existingTranscription.createdByEmail || '--'}</span></span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-text">
                        <i className="fas fa-calendar-plus text-[10px] text-gray-300"></i>
                        <span>Created: <span className="font-medium text-dark-text">{formatDate(existingTranscription.createdAt)}</span></span>
                      </div>
                      {existingTranscription.updatedByEmail && (
                        <div className="flex items-center gap-2 text-xs text-gray-text">
                          <i className="fas fa-user-edit text-[10px] text-gray-300"></i>
                          <span>Last updated by: <span className="font-medium text-dark-text">{existingTranscription.updatedByEmail || '--'}</span></span>
                        </div>
                      )}
                      {existingTranscription.updatedAt && (
                        <div className="flex items-center gap-2 text-xs text-gray-text">
                          <i className="fas fa-calendar-check text-[10px] text-gray-300"></i>
                          <span>Updated: <span className="font-medium text-dark-text">{formatDate(existingTranscription.updatedAt)}</span></span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          canEditDescription={false}
        />
      )}
    </Layout>
  );
}
