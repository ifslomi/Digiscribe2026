import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { useAuth } from '../contexts/AuthContext';
import { fileUrl } from '../lib/fileUrl';

export default function UserTranscriptionViewPage() {
  const { transcriptionId } = useParams();
  const { getIdToken } = useAuth();
  const [transcription, setTranscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTranscription = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/transcriptions/${transcriptionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load transcription.');
      }
      setTranscription(data.transcription);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [transcriptionId, getIdToken]);

  useEffect(() => {
    fetchTranscription();
  }, [fetchTranscription]);

  useEffect(() => {
    document.title = transcription?.title
      ? `${transcription.title} - DigiScribe`
      : 'Transcription - DigiScribe';
  }, [transcription]);

  const heroContent = (
    <div className="relative z-10 py-10 pb-6">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-text hover:text-primary transition-colors mb-4"
        >
          <i className="fas fa-arrow-left text-xs"></i>
          Back to Dashboard
        </Link>
        <h1 className="text-2xl md:text-3xl font-semibold gradient-text">
          {transcription?.title || transcription?.fileName || 'Transcription'}
        </h1>
        {transcription?.fileName && transcription?.title && (
          <p className="text-sm text-gray-text mt-1">
            <i className="fas fa-paperclip text-xs mr-1"></i>
            {transcription.fileName}
          </p>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <Layout heroContent={heroContent}>
        <div className="min-h-screen bg-[#f8fafc]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="text-center py-24">
              <i className="fas fa-spinner fa-spin text-3xl text-primary mb-4 block"></i>
              <p className="text-sm text-gray-text">Loading transcription...</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout heroContent={heroContent}>
        <div className="min-h-screen bg-[#f8fafc]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-exclamation-triangle text-red-500 text-xl"></i>
              </div>
              <p className="text-sm font-medium text-dark-text mb-1">Failed to load transcription</p>
              <p className="text-xs text-gray-text mb-4">{error}</p>
              <button
                onClick={fetchTranscription}
                className="text-sm font-medium text-primary hover:text-primary-dark transition-colors"
              >
                <i className="fas fa-sync-alt text-xs mr-1"></i>
                Try Again
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const t = transcription;
  const noteText = (t?.note || '').trim();
  const isFileDelivery = t?.deliveryType === 'file';

  return (
    <Layout heroContent={heroContent}>
      <div className="min-h-screen bg-[#f8fafc]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

          {/* Meta Info */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
              <div className="flex items-center gap-2 text-gray-text">
                <i className="fas fa-calendar-alt text-xs text-gray-300"></i>
                <span>
                  {t.createdAt
                    ? (() => { const d = new Date(t.createdAt); return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`; })()
                    : '--'}
                </span>
              </div>
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                isFileDelivery ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
              }`}>
                <i className={`fas ${isFileDelivery ? 'fa-file-circle-check' : 'fa-align-left'} text-[10px]`}></i>
                {isFileDelivery ? 'Transcripted File' : 'Text Transcription'}
              </div>
              {t.fileType && (
                <div className="flex items-center gap-2 text-gray-text">
                  <i className="fas fa-file text-xs text-gray-300"></i>
                  <span>{t.fileType}</span>
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          {isFileDelivery ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-file-circle-check text-rose-500 text-2xl"></i>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 text-[11px] font-medium mb-3">
                  <i className="fas fa-paperclip text-[9px]"></i>
                  Transcripted file
                </div>
                <h3 className="text-sm font-semibold text-dark-text mb-1">
                  {t.deliveryFileName || 'Transcription File'}
                </h3>
                {t.deliveryFileSize && (
                  <p className="text-xs text-gray-text mb-4">
                    {t.deliveryFileSize < 1024 * 1024
                      ? `${(t.deliveryFileSize / 1024).toFixed(1)} KB`
                      : `${(t.deliveryFileSize / (1024 * 1024)).toFixed(1)} MB`
                    }
                  </p>
                )}
                {t.deliveryFileUrl && (
                  <a
                    href={fileUrl(t.deliveryFileUrl)}
                    download={t.deliveryFileName || true}
                    className="inline-flex items-center gap-2 btn-gradient text-white px-6 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all"
                  >
                    <i className="fas fa-download text-xs"></i>
                    Download Transcript
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                <i className="fas fa-file-alt text-primary text-sm"></i>
                <h3 className="text-sm font-semibold text-dark-text">Transcription Content</h3>
              </div>
              <div className="p-6">
                <div className="prose prose-sm max-w-none text-dark-text whitespace-pre-wrap leading-relaxed">
                  {t.content || 'No content available.'}
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mt-6">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <i className="fas fa-sticky-note text-amber-500 text-sm"></i>
              <h3 className="text-sm font-semibold text-dark-text">Description / Note</h3>
            </div>
            <div className="p-6">
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-2.5 max-h-56 overflow-y-auto">
                {noteText ? (
                  <p className="text-sm md:text-[15px] text-dark-text whitespace-pre-wrap leading-relaxed">{noteText}</p>
                ) : (
                  <p className="text-sm md:text-[15px] text-gray-400 italic">No note provided.</p>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </Layout>
  );
}
