import { createPortal } from 'react-dom';
import { Button } from '../ui/button';
import { Card } from '../ui/card';

const PLATFORM_MAP = [
  { pattern: /youtu\.?be/i, label: 'YouTube' },
  { pattern: /facebook\.com|fb\.com|fb\.watch/i, label: 'Facebook' },
  { pattern: /dailymotion\.com|dai\.ly/i, label: 'Dailymotion' },
  { pattern: /drive\.google\.com|docs\.google\.com/i, label: 'Google Drive' },
  { pattern: /instagram\.com/i, label: 'Instagram' },
  { pattern: /tiktok\.com/i, label: 'TikTok' },
  { pattern: /twitter\.com|x\.com/i, label: 'Twitter/X' },
  { pattern: /vimeo\.com/i, label: 'Vimeo' },
  { pattern: /soundcloud\.com/i, label: 'SoundCloud' },
  { pattern: /twitch\.tv/i, label: 'Twitch' },
];

function getUrlPlatformLabel(url) {
  if (!url) return 'URL';
  const match = PLATFORM_MAP.find((p) => p.pattern.test(url));
  return match ? match.label : 'URL';
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  try {
    return new Date(dateStr).toLocaleString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function getUploadedByLabel(file) {
  if (!file) return '--';
  if (file.uploadedByAdmin) return file.uploaderEmail || 'admin@dtc.com';
  return file.uploaderEmail || file.uploadedByEmail || '--';
}

export default function FilePropertiesModal({ file, onClose }) {
  if (!file) return null;

  const platformSourceUrl = file.sourceUrl || file.sourceReferenceUrl || file.url;

  const rows = [
    { label: 'File Name', value: file.originalName },
    { label: 'Type', value: file.sourceType === 'url' ? getUrlPlatformLabel(platformSourceUrl) : (file.type || '--') },
    { label: 'Size', value: formatSize(file.size) },
    { label: 'Status', value: file.status || '--' },
    { label: 'Category', value: file.serviceCategory || '--' },
    { label: 'Uploaded By', value: getUploadedByLabel(file) },
    (file.uploadedByAdmin || (file.uploaderEmail && file.uploadedByEmail && file.uploaderEmail !== file.uploadedByEmail)) && {
      label: 'Owned By',
      value: file.uploadedByEmail,
    },
    { label: 'Upload Date', value: formatDate(file.uploadedAt) },
    { label: 'Source', value: file.sourceType === 'url' ? 'URL Upload' : 'File Upload' },
    file.sourceUrl && { label: 'Source URL', value: file.sourceUrl },
    file.description && { label: 'Description', value: file.description },
    { label: 'File ID', value: file.id },
  ].filter(Boolean);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <Card className="rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
              <i className="fas fa-info-circle text-gray-500 text-sm"></i>
            </div>
            <h3 className="text-sm font-semibold text-dark-text">Properties</h3>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="w-8 h-8 text-gray-400 hover:text-dark-text hover:bg-gray-100"
          >
            <i className="fas fa-times"></i>
          </Button>
        </div>

        <div className="px-6 py-4 max-h-[60vh] overflow-auto">
          <div className="space-y-3">
            {rows.map(({ label, value }) => (
              <div key={label}>
                <dt className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">{label}</dt>
                <dd className="text-sm text-dark-text break-all">{value}</dd>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
          <Button
            onClick={onClose}
            variant="ghost"
          >
            Close
          </Button>
        </div>
      </Card>
    </div>,
    document.body
  );
}
