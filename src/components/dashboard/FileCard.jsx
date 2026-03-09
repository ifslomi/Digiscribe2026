import { useState, useRef, useEffect } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(dateString) {
  if (!dateString) return '--';
  try {
    const date = new Date(dateString);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  } catch {
    return '--';
  }
}

const PLATFORM_MAP = [
  { domains: ['youtube.com', 'youtu.be'], label: 'YouTube', icon: 'fa-brands fa-youtube', color: 'text-red-600 bg-red-50 border-red-200' },
  { domains: ['facebook.com', 'fb.watch'], label: 'Facebook', icon: 'fa-brands fa-facebook-f', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  { domains: ['dailymotion.com', 'dai.ly'], label: 'Dailymotion', icon: 'fas fa-play', color: 'text-sky-600 bg-sky-50 border-sky-200' },
  { domains: ['drive.google.com', 'docs.google.com'], label: 'Google Drive', icon: 'fa-brands fa-google-drive', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { domains: ['instagram.com'], label: 'Instagram', icon: 'fa-brands fa-instagram', color: 'text-pink-600 bg-pink-50 border-pink-200' },
  { domains: ['tiktok.com', 'vm.tiktok.com'], label: 'TikTok', icon: 'fa-brands fa-tiktok', color: 'text-gray-800 bg-gray-50 border-gray-200' },
  { domains: ['twitter.com', 'x.com'], label: 'Twitter/X', icon: 'fa-brands fa-x-twitter', color: 'text-sky-500 bg-sky-50 border-sky-200' },
  { domains: ['vimeo.com'], label: 'Vimeo', icon: 'fa-brands fa-vimeo-v', color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
  { domains: ['soundcloud.com'], label: 'SoundCloud', icon: 'fa-brands fa-soundcloud', color: 'text-orange-500 bg-orange-50 border-orange-200' },
  { domains: ['twitch.tv'], label: 'Twitch', icon: 'fa-brands fa-twitch', color: 'text-purple-600 bg-purple-50 border-purple-200' },
];

function getUrlPlatform(sourceUrl) {
  if (!sourceUrl) return { label: 'URL', icon: 'fa-link', color: 'text-gray-500 bg-gray-50 border-gray-200' };
  try {
    const hostname = new URL(sourceUrl).hostname.replace('www.', '');
    return PLATFORM_MAP.find((p) => p.domains.some((d) => hostname.includes(d))) || { label: 'URL', icon: 'fa-link', color: 'text-gray-500 bg-gray-50 border-gray-200' };
  } catch {
    return { label: 'URL', icon: 'fa-link', color: 'text-gray-500 bg-gray-50 border-gray-200' };
  }
}

function getFileIcon(type) {
  if (!type) return 'fa-file';
  if (type.startsWith('image/')) return 'fa-image';
  if (type.startsWith('audio/')) return 'fa-music';
  if (type.startsWith('video/')) return 'fa-video';
  if (type === 'application/pdf') return 'fa-file-pdf';
  if (type.includes('word') || type === 'application/msword') return 'fa-file-word';
  if (type.includes('excel') || type.includes('spreadsheet')) return 'fa-file-excel';
  if (type.includes('powerpoint') || type.includes('presentation')) return 'fa-file-powerpoint';
  if (type === 'text/plain' || type === 'text/csv') return 'fa-file-alt';
  if (type === 'application/x-url') return 'fa-link';
  return 'fa-file';
}

function getFileIconColor(type) {
  if (!type) return 'text-gray-400 bg-gray-50';
  if (type.startsWith('image/')) return 'text-violet-600 bg-violet-50';
  if (type.startsWith('audio/')) return 'text-sky-600 bg-sky-50';
  if (type.startsWith('video/')) return 'text-rose-500 bg-rose-50';
  if (type === 'application/pdf') return 'text-red-600 bg-red-50';
  if (type.includes('word') || type === 'application/msword') return 'text-blue-600 bg-blue-50';
  if (type.includes('excel') || type.includes('spreadsheet')) return 'text-green-600 bg-green-50';
  if (type.includes('powerpoint') || type.includes('presentation')) return 'text-orange-600 bg-orange-50';
  if (type === 'application/x-url') return 'text-indigo-600 bg-indigo-50';
  return 'text-gray-400 bg-gray-50';
}

const statusConfig = {
  pending: {
    label: 'Pending',
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    border: 'border-amber-200',
    dot: 'bg-amber-400',
  },
  'in-progress': {
    label: 'In Progress',
    bg: 'bg-sky-50',
    text: 'text-sky-600',
    border: 'border-sky-200',
    dot: 'bg-sky-400',
  },
  transcribed: {
    label: 'Transcribed',
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    border: 'border-emerald-200',
    dot: 'bg-emerald-400',
  },
};

const statusOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'transcribed', label: 'Transcribed' },
];

export default function FileCard({ file, isAdmin, onStatusChange, onPreview, isSelected, onSelect, onDelete, deleteLoading, folderName, onOpenFolder, onTranscription, onViewTranscription, onDownloadTranscription, transcriptionDownloadLoading = false }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const status = statusConfig[file.status] || statusConfig.pending;
  const isUrl = file.sourceType === 'url';
  const urlPlatform = isUrl ? getUrlPlatform(file.sourceUrl || file.sourceReferenceUrl || file.url) : null;
  const icon = getFileIcon(file.type);
  const iconColor = getFileIconColor(file.type);
  const iconClass = isUrl && urlPlatform ? urlPlatform.icon : `fas ${icon}`;
  const iconBgClass = isUrl && urlPlatform ? urlPlatform.color : iconColor;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStatusSelect = (newStatus) => {
    setDropdownOpen(false);
    if (newStatus !== file.status && onStatusChange) {
      onStatusChange(file.id, newStatus);
    }
  };

  const handlePreview = () => {
    if (onPreview) onPreview(file);
  };

  return (
    <Card className={`rounded-xl overflow-hidden hover:shadow-md transition-all duration-200 group ${
      isSelected ? 'border-primary/40'
      : 'border-gray-100 hover:border-gray-200'
    }`}
      onClick={(e) => {
        if ((e.ctrlKey || e.metaKey || e.shiftKey) && onSelect) {
          e.preventDefault();
          e.stopPropagation();
          onSelect(file.id, e);
        }
      }}
    >
      {/* Top accent bar */}
      <div className={`h-0.5 ${status.dot}`} />

      <div className="p-5">
        {/* Header row: [checkbox] icon + name + status */}
        <div className="flex items-start gap-3 mb-3">
          {/* Inline checkbox — fades in on hover, always visible when selected */}
          {onSelect && (
            <label
              className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-all duration-150 ${
                isSelected
                  ? 'bg-primary border-primary'
                  : 'bg-white border-gray-300 opacity-0 group-hover:opacity-100'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={!!isSelected}
                onChange={() => onSelect(file.id)}
                className="sr-only"
              />
              {isSelected && <i className="fas fa-check text-white text-[7px]"></i>}
            </label>
          )}

          <Button
            type="button"
            onClick={handlePreview}
            variant="ghost"
            size="icon"
            className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBgClass} transition-all duration-200 cursor-pointer hover:scale-105`}
            title="Preview file"
          >
            <i className={`${iconClass} text-sm group-hover:hidden`}></i>
            <i className="fas fa-eye text-sm hidden group-hover:block"></i>
          </Button>

          <div className="flex-1 min-w-0">
            <h3
              className="text-sm font-semibold text-dark-text truncate cursor-pointer hover:text-primary transition-colors"
              title={file.originalName}
              onClick={handlePreview}
            >
              {file.originalName}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-gray-400">{formatSize(file.size)}</span>
              <span className="text-gray-200">·</span>
              <span className="text-[11px] text-gray-400">{formatDate(file.uploadedAt)}</span>
            </div>
          </div>

          {/* Status badge / dropdown */}
          <div className="relative flex-shrink-0" ref={dropdownRef}>
            {isAdmin ? (
              <>
                <Button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  variant="outline"
                  size="sm"
                  className={`gap-1.5 h-auto px-2.5 py-1 rounded-md text-[11px] font-semibold border ${status.bg} ${status.text} ${status.border} cursor-pointer hover:opacity-90 transition-opacity`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`}></span>
                  {status.label}
                  <i className="fas fa-chevron-down text-[7px] ml-0.5 opacity-60"></i>
                </Button>
                {dropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-36 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-20">
                    {statusOptions.map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        onClick={() => handleStatusSelect(opt.value)}
                        variant="ghost"
                        size="sm"
                        className={`w-full justify-start text-left px-3 py-2 text-xs font-medium transition-colors gap-2 ${
                          file.status === opt.value
                            ? 'text-primary bg-primary/5'
                            : 'text-gray-text hover:text-dark-text hover:bg-gray-50'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${statusConfig[opt.value].dot}`}></span>
                        {opt.label}
                        {file.status === opt.value && (
                          <i className="fas fa-check text-[8px] text-primary ml-auto"></i>
                        )}
                      </Button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <Badge variant="outline" className={`gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold ${status.bg} ${status.text} ${status.border}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`}></span>
                {status.label}
              </Badge>
            )}
          </div>
        </div>

        {/* Platform badge (URL uploads) + Service Category */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
          {isUrl && urlPlatform && (
            <Badge variant="outline" className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${urlPlatform.color}`}>
              {urlPlatform.label}
            </Badge>
          )}
          {file.serviceCategory && (
            <Badge variant="outline" className="gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium bg-indigo-50 text-indigo-600 border-indigo-100">
              <i className="fas fa-tag text-[8px] text-indigo-400"></i>
              {file.serviceCategory}
            </Badge>
          )}
          {folderName && (
            <Button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenFolder && onOpenFolder(); }}
              variant="outline"
              size="sm"
              className="gap-1 h-auto px-2 py-0.5 rounded-md text-[10px] font-medium bg-violet-50 text-violet-600 border-violet-100 hover:bg-violet-100"
              title={`Inside folder: ${folderName}`}
            >
              <i className="fas fa-folder text-[8px] text-violet-400"></i>
              {folderName}
            </Button>
          )}
          {file.transcriptionUrl && isAdmin && (
            <Button
              type="button"
              onClick={(e) => { e.stopPropagation(); onTranscription && onTranscription(file); }}
              variant="outline"
              size="sm"
              className="gap-1 h-auto px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100"
              title={file.transcriptionName || 'Transcription attached'}
            >
              <i className="fas fa-file-circle-check text-[8px] text-emerald-400"></i>
              Transcribed
            </Button>
          )}
        </div>

        {/* Description */}
        {file.description && (
          <p className="text-xs text-gray-400 mb-3 line-clamp-2 leading-relaxed">
            {file.description}
          </p>
        )}

        {/* Transcription attachment (user grid view) */}
        {file.transcriptionUrl && !isAdmin && (
          <div className="mb-3 p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-100">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 rounded-md bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <i className="fas fa-file-circle-check text-emerald-500 text-[9px]"></i>
              </div>
              <span className="text-[11px] font-medium text-dark-text truncate flex-1" title={file.transcriptionName}>
                {file.transcriptionName || 'Transcription'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 pl-7">
              <Button
                type="button"
                onClick={(e) => { e.stopPropagation(); onViewTranscription && onViewTranscription(file); }}
                variant="ghost"
                size="sm"
                className="gap-1 h-auto px-2 py-1 rounded-md text-[10px] font-medium text-gray-500 hover:text-primary hover:bg-white"
              >
                <i className="fas fa-eye text-[9px]"></i>
                View
              </Button>
              <Button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDownloadTranscription && onDownloadTranscription(file); }}
                disabled={transcriptionDownloadLoading}
                variant="ghost"
                size="sm"
                className="gap-1 h-auto px-2 py-1 rounded-md text-[10px] font-medium text-emerald-500 hover:text-emerald-600 hover:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {transcriptionDownloadLoading ? (
                  <i className="fas fa-spinner fa-spin text-[9px]"></i>
                ) : (
                  <i className="fas fa-download text-[9px]"></i>
                )}
                {transcriptionDownloadLoading ? 'Downloading...' : 'Download'}
              </Button>
            </div>
          </div>
        )}

        {/* Footer: uploader info + action */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-50">
          <>
          <div className="flex items-center gap-2 text-[11px] text-gray-400 min-w-0">
            {isAdmin && file.uploadedByEmail ? (
              <span className="flex items-center gap-1.5 truncate" title={file.uploadedByEmail}>
                <i className="fas fa-user text-[9px] text-gray-300"></i>
                <span className="truncate">{file.uploadedByEmail}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <i className="fas fa-calendar text-[9px] text-gray-300"></i>
                {formatDate(file.uploadedAt)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {isUrl && (
              <Badge variant="outline" className="gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-gray-50 text-gray-400 border-gray-200" title="Downloaded from URL — cannot be re-downloaded">
                <i className="fas fa-ban text-[9px]"></i>
                No download
              </Badge>
            )}
            {onDelete && (
              <Button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(file.id); }}
                disabled={!!deleteLoading}
                variant="ghost"
                size="sm"
                className="opacity-0 group-hover:opacity-100 gap-1.5 text-[11px] font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all duration-150 disabled:opacity-30"
                title="Delete file"
              >
                {deleteLoading
                  ? <i className="fas fa-spinner fa-spin text-[10px]"></i>
                  : <i className="fas fa-trash-alt text-[10px]"></i>
                }
              </Button>
            )}
            <Button
              type="button"
              onClick={handlePreview}
              variant="ghost"
              size="sm"
              className="gap-1.5 text-[11px] font-medium text-gray-400 hover:text-primary hover:bg-primary/5"
            >
              <i className="fas fa-eye text-[10px]"></i>
              Preview
            </Button>
          </div>
          </>
        </div>
      </div>
    </Card>
  );
}
