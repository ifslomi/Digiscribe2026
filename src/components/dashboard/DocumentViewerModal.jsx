import { useState, useEffect, useCallback } from 'react';
import { fileUrl, fileDownloadUrl } from '../../lib/fileUrl';

function getViewerType(mimeType, fileName) {
  if (!mimeType && !fileName) return 'unsupported';
  const mime = (mimeType || '').toLowerCase();
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';

  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime === 'text/plain' || mime === 'text/csv' || ext === 'txt' || ext === 'csv') return 'text';
  if (
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    mime === 'application/vnd.ms-powerpoint' ||
    mime === 'application/rtf' ||
    ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'rtf', 'odt'].includes(ext)
  ) {
    return 'office';
  }
  return 'unsupported';
}

function getFileIcon(type) {
  if (type === 'pdf') return 'fa-file-pdf';
  if (type === 'text') return 'fa-file-alt';
  if (type === 'office') return 'fa-file-word';
  return 'fa-file';
}

export default function DocumentViewerModal({ file, onClose }) {
  const [textContent, setTextContent] = useState(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState(null);

  const url = file?.url ? fileUrl(file.url) : null;
  const viewerType = getViewerType(file?.type, file?.name);

  const downloadUrl = useCallback(() => {
    if (!url) return;
    const resolved = fileDownloadUrl(url);
    const a = document.createElement('a');
    a.href = resolved;
    a.download = file?.name || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [url, file?.name]);

  // Fetch text content for .txt/.csv files
  useEffect(() => {
    if (viewerType !== 'text' || !url) return;
    setTextLoading(true);
    setTextError(null);
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        return res.text();
      })
      .then((text) => { setTextContent(text); setTextLoading(false); })
      .catch((err) => { setTextError(err.message); setTextLoading(false); });
  }, [viewerType, url]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!file) return null;

  // Build Google Docs Viewer URL for office files
  const absoluteUrl = url?.startsWith('http') ? url : `${window.location.origin}${url}`;
  const googleViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(absoluteUrl)}&embedded=true`;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <i className={`fas ${getFileIcon(viewerType)} text-emerald-500 text-sm`}></i>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-dark-text truncate">{file.name}</p>
              {file.size > 0 && (
                <p className="text-[11px] text-gray-400">
                  {file.size < 1024 ? `${file.size} B` : file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={downloadUrl}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary bg-primary/5 hover:bg-primary/10 transition-colors"
            >
              <i className="fas fa-download text-[10px]"></i>
              Download
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-dark-text hover:bg-gray-100 transition-colors"
            >
              <i className="fas fa-times text-sm"></i>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-gray-50">
          {viewerType === 'pdf' && (
            <iframe
              src={`${url}#toolbar=1&navpanes=0`}
              className="w-full h-full min-h-[70vh]"
              title={file.name}
            />
          )}

          {viewerType === 'text' && (
            <div className="p-5">
              {textLoading && (
                <div className="flex items-center justify-center py-16">
                  <i className="fas fa-spinner fa-spin text-primary text-lg mr-3"></i>
                  <span className="text-sm text-gray-text">Loading document...</span>
                </div>
              )}
              {textError && (
                <div className="flex flex-col items-center justify-center py-16">
                  <i className="fas fa-exclamation-circle text-red-400 text-2xl mb-3"></i>
                  <p className="text-sm text-red-500 font-medium">Failed to load document</p>
                  <p className="text-xs text-gray-400 mt-1">{textError}</p>
                </div>
              )}
              {!textLoading && !textError && textContent !== null && (
                <pre className="bg-white rounded-xl border border-gray-200 p-5 text-sm text-dark-text font-mono leading-relaxed overflow-auto max-h-[65vh] whitespace-pre-wrap break-words">
                  {textContent}
                </pre>
              )}
            </div>
          )}

          {viewerType === 'office' && (
            <iframe
              src={googleViewerUrl}
              className="w-full h-full min-h-[70vh]"
              title={file.name}
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          )}

          {viewerType === 'unsupported' && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <i className="fas fa-file text-gray-300 text-2xl"></i>
              </div>
              <p className="text-sm font-medium text-dark-text mb-1">Preview not available</p>
              <p className="text-xs text-gray-400 mb-1">This file type cannot be previewed in the browser.</p>
              <p className="text-xs text-red-500 mb-4 text-center max-w-md">Unsupported transcription format detected. Allowed formats: PDF, TXT/CSV, DOC/DOCX, XLS/XLSX, PPT/PPTX, RTF, and ODT.</p>
              <button
                type="button"
                onClick={downloadUrl}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary hover:bg-primary-dark transition-colors"
              >
                <i className="fas fa-download text-xs"></i>
                Download File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
