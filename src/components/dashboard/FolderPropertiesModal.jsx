import { createPortal } from 'react-dom';
import { Button } from '../ui/button';
import { Card } from '../ui/card';

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

export default function FolderPropertiesModal({ folder, itemCount, totalSize, onClose }) {
  if (!folder) return null;

  const rows = [
    { label: 'Folder Name', value: folder.name },
    { label: 'Items', value: itemCount !== undefined ? `${itemCount} item${itemCount !== 1 ? 's' : ''}` : '--' },
    { label: 'Total Size', value: totalSize > 0 ? formatSize(totalSize) : '0 B (empty)' },
    { label: 'Created By', value: folder.creatorEmail || folder.createdByEmail || '--' },
    folder.creatorEmail && folder.createdByEmail && folder.creatorEmail !== folder.createdByEmail && {
      label: 'Owned By',
      value: folder.createdByEmail,
    },
    { label: 'Created', value: formatDate(folder.createdAt) },
    folder.updatedAt && { label: 'Last Modified', value: formatDate(folder.updatedAt) },
    { label: 'Folder ID', value: folder.id },
  ].filter(Boolean);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <Card className="rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <i className="fas fa-folder text-indigo-500 text-sm"></i>
            </div>
            <h3 className="text-sm font-semibold text-dark-text">Folder Properties</h3>
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

        {/* Size summary banner */}
        <div className="px-6 pt-4">
          <div className="flex items-center gap-4 p-4 rounded-xl bg-indigo-50 border border-indigo-100">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <i className="fas fa-folder-open text-indigo-500 text-base"></i>
            </div>
            <div>
              <p className="text-[11px] font-medium text-indigo-400 uppercase tracking-wide">Total Size</p>
              <p className="text-lg font-bold text-indigo-600">{totalSize > 0 ? formatSize(totalSize) : '-- (empty)'}</p>
            </div>
            {itemCount !== undefined && (
              <div className="ml-auto text-right">
                <p className="text-[11px] font-medium text-indigo-400 uppercase tracking-wide">Items</p>
                <p className="text-lg font-bold text-indigo-600">{itemCount}</p>
              </div>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="px-6 py-4 max-h-[50vh] overflow-auto">
          <div className="space-y-3">
            {rows.map(({ label, value }) => (
              <div key={label}>
                <dt className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">{label}</dt>
                <dd className="text-sm text-dark-text break-all">{value}</dd>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
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
