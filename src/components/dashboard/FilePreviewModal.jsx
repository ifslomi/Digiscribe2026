'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { TikTokEmbed, FacebookEmbed } from 'react-social-media-embed';
import { fileUrl, fileDownloadUrl } from '../../lib/fileUrl';

function getFileMediaType(type, fileName = '') {
  const normalizedType = String(type || '').toLowerCase();
  const ext = String(fileName || '').split('.').pop()?.toLowerCase() || '';
  const officeExts = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'rtf', 'odt']);

  if (normalizedType.startsWith('image/')) return 'image';
  if (normalizedType.startsWith('audio/')) return 'audio';
  if (normalizedType.startsWith('video/')) return 'video';
  if (normalizedType === 'application/pdf' || ext === 'pdf') return 'pdf';

  // Extension takes precedence for office docs because some uploads are tagged as text/plain.
  if (officeExts.has(ext)) return 'office';

  if (normalizedType.startsWith('text/') || ['txt', 'csv'].includes(ext)) return 'text';
  if (
    normalizedType === 'application/msword' ||
    normalizedType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    normalizedType === 'application/vnd.ms-excel' ||
    normalizedType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    normalizedType === 'application/vnd.ms-powerpoint' ||
    normalizedType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    normalizedType === 'application/rtf' ||
    normalizedType === 'application/vnd.oasis.opendocument.text' ||
    officeExts.has(ext)
  ) {
    return 'office';
  }

  return 'unknown';
}

function getFriendlyTypeLabel(type, fileName = '') {
  const mediaType = getFileMediaType(type, fileName);
  if (mediaType === 'image') return 'Image';
  if (mediaType === 'audio') return 'Audio';
  if (mediaType === 'video') return 'Video';
  if (mediaType === 'pdf') return 'PDF';
  if (mediaType === 'text') return 'Text';
  if (mediaType === 'office') {
    const ext = String(fileName || '').split('.').pop()?.toLowerCase() || '';
    if (ext === 'xls' || ext === 'xlsx') return 'Excel';
    if (ext === 'doc' || ext === 'docx') return 'Word';
    if (ext === 'ppt' || ext === 'pptx') return 'PowerPoint';
    return 'Office';
  }
  return type || 'Unknown';
}

function isAllowedByCurrentUploadPolicy(type, fileName = '') {
  const normalizedType = String(type || '').toLowerCase();
  if (!normalizedType) return false;
  if (normalizedType.startsWith('image/') || normalizedType.startsWith('audio/') || normalizedType.startsWith('video/')) return true;

  const allowedDocMimes = new Set([
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]);
  if (allowedDocMimes.has(normalizedType)) return true;

  const ext = String(fileName || '').split('.').pop()?.toLowerCase() || '';
  return ['pdf', 'txt', 'doc', 'docx'].includes(ext);
}

export function getMediaType(url) {
  if (!url) return 'unknown';

  const lowered = String(url).toLowerCase();
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace('www.', '').toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (hostname.includes('tiktok.com')) return 'tiktok';
    if (extractYouTubeId(url)) return 'youtube';
    if (hostname.includes('facebook.com') || hostname.includes('fb.watch')) return 'facebook';
    if (extractDailymotionId(url)) return 'dailymotion';
    if (extractGoogleDriveId(url)) return 'google-drive';

    const videoExt = ['.mp4', '.webm', '.mov', '.mkv', '.m4v', '.avi'];
    const audioExt = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.opus'];
    if (videoExt.some((ext) => pathname.endsWith(ext))) return 'direct-video';
    if (audioExt.some((ext) => pathname.endsWith(ext))) return 'direct-audio';

    return 'unknown';
  } catch {
    if (/youtube\.com|youtu\.be/.test(lowered)) return 'youtube';
    if (/tiktok\.com/.test(lowered)) return 'tiktok';
    if (/facebook\.com|fb\.watch/.test(lowered)) return 'facebook';
    if (/dailymotion\.com|dai\.ly/.test(lowered)) return 'dailymotion';
    if (/\.(mp4|webm|mov|mkv|m4v|avi)(\?|#|$)/.test(lowered)) return 'direct-video';
    if (/\.(mp3|wav|ogg|m4a|aac|flac|opus)(\?|#|$)/.test(lowered)) return 'direct-audio';
    return 'unknown';
  }
}

function extractYouTubeId(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace('www.', '').toLowerCase();
    const pathname = parsed.pathname;

    if (hostname.includes('youtu.be')) {
      const id = pathname.split('/').filter(Boolean)[0];
      return id && id.length >= 10 ? id : null;
    }

    if (hostname.includes('youtube.com')) {
      const byQuery = parsed.searchParams.get('v');
      if (byQuery) return byQuery;
      const shorts = pathname.match(/\/shorts\/([a-zA-Z0-9_-]{10,})/i)?.[1];
      if (shorts) return shorts;
      const embed = pathname.match(/\/embed\/([a-zA-Z0-9_-]{10,})/i)?.[1];
      if (embed) return embed;
    }
  } catch {
    return null;
  }
  return null;
}

function extractDailymotionId(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace('www.', '').toLowerCase();
    const pathname = parsed.pathname;

    if (hostname.includes('dai.ly')) {
      return pathname.split('/').filter(Boolean)[0] || null;
    }

    if (hostname.includes('dailymotion.com')) {
      return pathname.match(/\/(?:video|embed\/video)\/([a-zA-Z0-9]+)/i)?.[1] || null;
    }
  } catch {
    return null;
  }
  return null;
}

function extractGoogleDriveId(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace('www.', '').toLowerCase();
    if (!hostname.includes('drive.google.com')) return null;

    const pathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/i)?.[1];
    const queryId = parsed.searchParams.get('id');
    return pathMatch || queryId || null;
  } catch {
    return null;
  }
}

function getYouTubeEmbedUrl(url) {
  const id = extractYouTubeId(url);
  return id ? `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1` : null;
}

function getDailymotionEmbedUrl(url) {
  const id = extractDailymotionId(url);
  return id ? `https://www.dailymotion.com/embed/video/${id}` : null;
}

function getPlatformLabel(mediaType) {
  if (mediaType === 'youtube') return 'YouTube';
  if (mediaType === 'facebook') return 'Facebook';
  if (mediaType === 'tiktok') return 'TikTok';
  if (mediaType === 'dailymotion') return 'Dailymotion';
  if (mediaType === 'google-drive') return 'Google Drive';
  return 'URL';
}

function toFacebookEmbedUrl(sourceUrl) {
  if (!sourceUrl) return sourceUrl;

  try {
    const parsed = new URL(sourceUrl);
    const videoId = parsed.searchParams.get('v');

    if (videoId) {
      return `https://www.facebook.com/watch/?v=${videoId}`;
    }

    return sourceUrl;
  } catch {
    return sourceUrl;
  }
}

function PreviewFailedFallback({ sourceUrl }) {
  return (
    <div className="text-center py-10 px-6">
      <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-3">
        <i className="fas fa-exclamation-triangle text-amber-500 text-xl"></i>
      </div>
      <p className="text-sm font-medium text-dark-text mb-1">Preview failed</p>
      <p className="text-xs text-gray-text">
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          Watch on original site
        </a>
      </p>
    </div>
  );
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilePreviewModal({ file, onClose, canEditDescription = false, onSaveDescription }) {
  const overlayRef = useRef(null);
  const [textContent, setTextContent] = useState(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState(null);
  const [descriptionValue, setDescriptionValue] = useState(file.description || '');
  const [descriptionSaving, setDescriptionSaving] = useState(false);
  const [descriptionMessage, setDescriptionMessage] = useState(null);
  const [referenceSourceUrl, setReferenceSourceUrl] = useState(null);

  useEffect(() => {
    setDescriptionValue(file.description || '');
    setDescriptionMessage(null);
  }, [file.id, file.description]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const isUrlUpload = file.sourceType === 'url';
  const mediaType = getFileMediaType(file.type, file.originalName);
  const isDisallowedLegacyFile = !isUrlUpload && !isAllowedByCurrentUploadPolicy(file.type, file.originalName);

  useEffect(() => {
    setReferenceSourceUrl(null);
  }, [file.id]);

  useEffect(() => {
    if (!isUrlUpload || file.sourceUrl || mediaType !== 'text' || !file.url) return;

    fetch(fileUrl(file.url))
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load URL reference');
        return res.text();
      })
      .then((text) => {
        const match = text.match(/Source URL:\s*(https?:\/\/\S+)/i);
        if (match?.[1]) {
          setReferenceSourceUrl(match[1].trim());
        }
      })
      .catch(() => {
        // ignore parsing failures; fallback link remains available
      });
  }, [isUrlUpload, file.sourceUrl, mediaType, file.url]);

  useEffect(() => {
    setMediaError(null);
    setMediaLoading(mediaType === 'video' || mediaType === 'audio');
  }, [file.id, mediaType]);

  // Fetch text file content for preview
  useEffect(() => {
    if (mediaType !== 'text' || !file.url) return;
    if (file.sourceType === 'url' && file.sourceUrl) return;
    setTextLoading(true);
    setTextError(null);
    fetch(fileUrl(file.url))
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load file.');
        return res.text();
      })
      .then((text) => setTextContent(text))
      .catch((err) => setTextError(err.message))
      .finally(() => setTextLoading(false));
  }, [mediaType, file.url]);

  const sourceUrl = file.sourceUrl || referenceSourceUrl || file.sourceReferenceUrl || file.url;
  const embeddableSourceUrl = file.sourceUrl || referenceSourceUrl || null;
  const isUrlReferenceEntry = isUrlUpload && !!file.sourceUrl;

  // Only use platform embeds when we DON'T have a local downloaded copy.
  const hasLocalFile = file.url && file.url.startsWith('/api/files/') && !isUrlReferenceEntry;
  const urlMediaType = useMemo(() => getMediaType(embeddableSourceUrl), [embeddableSourceUrl]);
  const previewMode = useMemo(() => {
    if (!isUrlUpload || !embeddableSourceUrl || hasLocalFile) return null;

    if (urlMediaType === 'youtube') return 'youtube';
    if (urlMediaType === 'dailymotion') return 'dailymotion';
    if (urlMediaType === 'tiktok') return 'tiktok';
    if (urlMediaType === 'facebook') return 'facebook';
    if (urlMediaType === 'google-drive') return 'google-drive';
    if (urlMediaType === 'direct-audio') return 'direct-audio';
    if (urlMediaType === 'direct-video') return 'direct-video';

    return null;
  }, [isUrlUpload, embeddableSourceUrl, hasLocalFile, urlMediaType]);
  const showInlineSourceFallback = isUrlUpload && sourceUrl && (mediaError || (!previewMode && !hasLocalFile));
  const youtubeEmbedUrl = useMemo(() => getYouTubeEmbedUrl(embeddableSourceUrl), [embeddableSourceUrl]);
  const dailymotionEmbedUrl = useMemo(() => getDailymotionEmbedUrl(embeddableSourceUrl), [embeddableSourceUrl]);
  const facebookEmbedUrl = useMemo(() => toFacebookEmbedUrl(embeddableSourceUrl), [embeddableSourceUrl]);
  const googleDrivePreviewUrl = useMemo(() => {
    const fileId = extractGoogleDriveId(embeddableSourceUrl);
    return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : null;
  }, [embeddableSourceUrl]);
  const officeViewerUrl = useMemo(() => {
    if (mediaType !== 'office' || !file.url) return null;
    const absoluteUrl = `${window.location.origin}${fileUrl(file.url)}`;
    return `https://docs.google.com/gview?url=${encodeURIComponent(absoluteUrl)}&embedded=true`;
  }, [mediaType, file.url]);

  useEffect(() => {
    setMediaError(null);
  }, [file.id, previewMode]);

  const iconInfo = useMemo(() => {
    if (urlMediaType === 'youtube') return { icon: 'fa-brands fa-youtube', color: 'text-red-500 bg-red-50' };
    if (urlMediaType === 'dailymotion') return { icon: 'fas fa-play', color: 'text-sky-600 bg-sky-50' };
    if (urlMediaType === 'tiktok') return { icon: 'fa-brands fa-tiktok', color: 'text-gray-900 bg-gray-100' };
    if (urlMediaType === 'facebook') return { icon: 'fa-brands fa-facebook-f', color: 'text-blue-600 bg-blue-50' };
    if (mediaType === 'image') return { icon: 'fa-image', color: 'text-violet-600 bg-violet-50' };
    if (mediaType === 'audio') return { icon: 'fa-music', color: 'text-sky-600 bg-sky-50' };
    if (mediaType === 'video') return { icon: 'fa-video', color: 'text-rose-500 bg-rose-50' };
    if (mediaType === 'pdf') return { icon: 'fa-file-pdf', color: 'text-red-600 bg-red-50' };
    if (mediaType === 'office') return { icon: 'fa-file-word', color: 'text-blue-600 bg-blue-50' };
    if (mediaType === 'text') return { icon: 'fa-file-alt', color: 'text-gray-600 bg-gray-50' };
    if (isUrlUpload) return { icon: 'fa-link', color: 'text-indigo-600 bg-indigo-50' };
    return { icon: 'fa-file', color: 'text-gray-400 bg-gray-50' };
  }, [urlMediaType, mediaType, isUrlUpload]);

  const renderContent = () => {
    if (isUrlUpload && sourceUrl && mediaError) {
      return <PreviewFailedFallback sourceUrl={sourceUrl} />;
    }

    // URL uploads with supported platform/direct media previews
    if (isUrlUpload && sourceUrl && previewMode === 'youtube' && youtubeEmbedUrl) {
      return (
        <iframe
          src={youtubeEmbedUrl}
          className="w-full max-w-4xl mx-auto aspect-video rounded-lg shadow-sm"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          title={file.originalName}
          onError={() => setMediaError('Preview failed')}
        />
      );
    }

    if (isUrlUpload && sourceUrl && previewMode === 'dailymotion' && dailymotionEmbedUrl) {
      return (
        <iframe
          src={dailymotionEmbedUrl}
          className="w-full max-w-4xl mx-auto aspect-video rounded-lg shadow-sm"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          title={file.originalName}
          onError={() => setMediaError('Preview failed')}
        />
      );
    }

    if (isUrlUpload && sourceUrl && previewMode === 'tiktok') {
      return (
        <div className="w-full flex justify-center">
          <TikTokEmbed url={embeddableSourceUrl} width={325} />
        </div>
      );
    }

    if (isUrlUpload && sourceUrl && previewMode === 'facebook') {
      return (
        <div className="w-full flex justify-center">
          <FacebookEmbed url={facebookEmbedUrl} width={560} />
        </div>
      );
    }

    if (isUrlUpload && sourceUrl && previewMode === 'google-drive' && googleDrivePreviewUrl) {
      return (
        <iframe
          src={googleDrivePreviewUrl}
          className="w-full border-0 rounded-lg"
          style={{ minHeight: '70vh' }}
          title={file.originalName}
          allow="autoplay; encrypted-media"
        />
      );
    }

    if (isUrlUpload && sourceUrl && previewMode === 'direct-audio') {
      return (
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
            <div className="w-20 h-20 bg-sky-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fas fa-music text-sky-500 text-2xl"></i>
            </div>
            <p className="text-sm font-medium text-dark-text mb-6 truncate">{file.originalName}</p>
            <audio controls className="w-full" preload="metadata" onError={() => setMediaError('Preview failed')}>
              <source src={embeddableSourceUrl} />
              Your browser does not support the audio element.
            </audio>
          </div>
        </div>
      );
    }

    if (isUrlUpload && sourceUrl && previewMode === 'direct-video') {
      return (
        <div className="relative">
          <video
            controls
            className="max-w-full max-h-[70vh] rounded-lg shadow-sm"
            preload="metadata"
            playsInline
            onLoadedData={() => setMediaLoading(false)}
            onCanPlay={() => setMediaLoading(false)}
            onWaiting={() => setMediaLoading(true)}
            onPlaying={() => setMediaLoading(false)}
            onError={() => {
              setMediaLoading(false);
              setMediaError('Preview failed');
            }}
          >
            <source src={embeddableSourceUrl} />
            Your browser does not support the video element.
          </video>

        </div>
      );
    }

    if (isUrlUpload && sourceUrl && !hasLocalFile) {
      return <PreviewFailedFallback sourceUrl={sourceUrl} />;
    }

    // Direct file uploads — use stored URL
    if (mediaType === 'image') {
      return (
        <img
          src={fileUrl(file.url)}
          alt={file.originalName}
          className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm"
        />
      );
    }

    if (mediaType === 'audio') {
      return (
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
            <div className="w-20 h-20 bg-sky-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fas fa-music text-sky-500 text-2xl"></i>
            </div>
            <p className="text-sm font-medium text-dark-text mb-6 truncate">{file.originalName}</p>
            <audio controls className="w-full" preload="metadata">
              <source src={fileUrl(file.url)} type={file.type} />
              Your browser does not support the audio element.
            </audio>
          </div>
        </div>
      );
    }

    if (mediaType === 'video') {
      if (mediaError) {
        return (
          <div className="text-center py-12">
            <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <i className="fas fa-exclamation-triangle text-amber-500 text-xl"></i>
            </div>
            <p className="text-sm font-medium text-dark-text mb-1">Unable to preview this video in-browser</p>
            <p className="text-xs text-gray-text mb-5">
              The file may be very large, still processing, or not supported by this browser codec.
            </p>
          </div>
        );
      }

      return (
        <div className="relative">
          <video
            controls
            className="max-w-full max-h-[70vh] rounded-lg shadow-sm"
            preload="metadata"
            playsInline
            onLoadedData={() => setMediaLoading(false)}
            onCanPlay={() => setMediaLoading(false)}
            onWaiting={() => setMediaLoading(true)}
            onPlaying={() => setMediaLoading(false)}
            onError={() => {
              setMediaLoading(false);
              setMediaError('Video failed to load.');
            }}
          >
            <source src={fileUrl(file.url)} type={file.type} />
            Your browser does not support the video element.
          </video>

        </div>
      );
    }

    if (mediaType === 'pdf') {
      return (
        <iframe
          src={fileUrl(file.url)}
          className="w-full border-0"
          style={{ minHeight: '70vh' }}
          title={file.originalName}
        />
      );
    }

    if (mediaType === 'office' && officeViewerUrl) {
      return (
        <iframe
          src={officeViewerUrl}
          className="w-full border-0"
          style={{ minHeight: '70vh' }}
          title={file.originalName}
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      );
    }

    if (mediaType === 'text') {
      return (
        <div className="w-full">
          {textLoading && (
            <div className="text-center py-12">
              <i className="fas fa-spinner fa-spin text-primary text-2xl mb-3 block"></i>
              <p className="text-sm text-gray-text">Loading file...</p>
            </div>
          )}
          {textError && (
            <div className="text-center py-12">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="fas fa-exclamation-circle text-red-400 text-xl"></i>
              </div>
              <p className="text-sm text-red-600">{textError}</p>
            </div>
          )}
          {!textLoading && !textError && textContent !== null && (
            <pre className="w-full bg-gray-50 rounded-xl border border-gray-200 p-5 text-xs text-gray-700 font-mono overflow-auto max-h-[65vh] whitespace-pre-wrap break-words">
              {textContent}
            </pre>
          )}
        </div>
      );
    }

    // Fallback — unknown type
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <i className="fas fa-file text-gray-400 text-2xl"></i>
        </div>
        <p className="text-sm font-medium text-dark-text mb-1">Preview not available</p>
        <p className="text-xs text-gray-text mb-5">This file type cannot be previewed in the browser.</p>
        {file.url && (
          <a
            href={fileDownloadUrl(file.url)}
            className="inline-flex items-center gap-2 px-4 py-2.5 btn-gradient text-white text-sm font-semibold rounded-lg shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 transition-all"
          >
            <i className="fas fa-download text-xs"></i>
            Download File
          </a>
        )}
      </div>
    );
  };

  const handleSaveDescription = async () => {
    if (!onSaveDescription) return;
    setDescriptionSaving(true);
    setDescriptionMessage(null);
    try {
      await onSaveDescription(file.id, descriptionValue);
      setDescriptionMessage({ type: 'success', text: 'Note saved.' });
    } catch (err) {
      setDescriptionMessage({ type: 'error', text: err.message || 'Failed to save note.' });
    } finally {
      setDescriptionSaving(false);
    }
  };

  return createPortal(
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[96vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${iconInfo.color}`}>
              <i className={`${iconInfo.icon.startsWith('fa-brands') ? iconInfo.icon : `fas ${iconInfo.icon}`} text-sm`}></i>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-dark-text truncate" title={file.originalName}>
                {file.originalName}
              </h3>
              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                {(isUrlUpload ? getPlatformLabel(urlMediaType) : getFriendlyTypeLabel(file.type, file.originalName)) && <span>{isUrlUpload ? getPlatformLabel(urlMediaType) : getFriendlyTypeLabel(file.type, file.originalName)}</span>}
                {formatSize(file.size) && (
                  <>
                    <span className="text-gray-200">·</span>
                    <span>{formatSize(file.size)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-dark-text hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Content */}
        {isDisallowedLegacyFile && (
          <div className="mx-6 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-medium text-amber-800">
              Legacy file notice: this file type is no longer allowed for upload under current policy (allowed docs: PDF/TXT/DOC/DOCX).
            </p>
          </div>
        )}
        <div className={`flex-1 min-h-0 bg-gray-50/50 ${mediaType === 'pdf' || mediaType === 'office' ? 'overflow-auto' : 'overflow-hidden p-6 flex items-center justify-center'}`}>
          {renderContent()}
        </div>

        {/* Description / Notes */}
        <div className="px-6 py-2.5 border-t border-gray-100 bg-white">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h4 className="text-xs font-semibold text-gray-text uppercase tracking-wider">Description / Note</h4>
            {canEditDescription && (
              <button
                type="button"
                onClick={handleSaveDescription}
                disabled={descriptionSaving || descriptionValue.trim() === (file.description || '').trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-white bg-primary hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {descriptionSaving ? (
                  <i className="fas fa-spinner fa-spin text-[10px]"></i>
                ) : (
                  <i className="fas fa-save text-[10px]"></i>
                )}
                Save
              </button>
            )}
          </div>

          {canEditDescription ? (
            <>
              <textarea
                value={descriptionValue}
                onChange={(e) => setDescriptionValue(e.target.value)}
                placeholder="Add note/details for this file..."
                maxLength={2000}
                className="w-full h-20 max-h-28 overflow-y-auto resize-none rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-dark-text focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-gray-400">{descriptionValue.length}/2000</span>
                {descriptionMessage && (
                  <span className={`text-[11px] ${descriptionMessage.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {descriptionMessage.text}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-2.5 max-h-20 overflow-y-auto">
              {file.description ? (
                <p className="text-sm text-dark-text whitespace-pre-wrap break-words leading-relaxed">{file.description}</p>
              ) : (
                <p className="text-sm text-gray-400 italic">No note provided.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-white">
          <div className="flex items-center gap-2">
            {file.serviceCategory && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100">
                <i className="fas fa-tag text-indigo-400 text-[9px]"></i>
                {file.serviceCategory}
              </span>
            )}
            {isUrlUpload && sourceUrl && !showInlineSourceFallback && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-primary transition-colors"
                title={sourceUrl}
              >
                <i className="fas fa-external-link-alt text-[9px]"></i>
                Source
              </a>
            )}
          </div>
          <div className="flex items-center gap-2">
            {mediaType === 'video' && file.url && (
              <a
                href={fileUrl(file.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-text hover:text-dark-text hover:bg-gray-100 rounded-lg transition-colors"
              >
                <i className="fas fa-up-right-from-square text-[10px]"></i>
                Open Direct
              </a>
            )}
            {file.url && (
              <a
                href={fileDownloadUrl(file.url)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-text hover:text-dark-text hover:bg-gray-100 rounded-lg transition-colors"
              >
                <i className="fas fa-download text-[10px]"></i>
                Download
              </a>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
