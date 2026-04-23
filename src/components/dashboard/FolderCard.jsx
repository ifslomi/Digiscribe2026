import { useState } from 'react';

function formatDate(dateString) {
  if (!dateString) return '--';
  try {
    const d = new Date(dateString);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  } catch {
    return '--';
  }
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function FolderCard({
  folder,
  onOpen,
  onContextMenu,
  isSelected,
  onSelect,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart: onDragStartProp,
  itemCount,
  totalSize,
  showOwner,
  onDelete,
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`bg-white rounded-xl border overflow-hidden transition-all duration-200 cursor-pointer group ${
        isDragOver
          ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
          : isSelected
          ? 'border-primary/30 ring-1 ring-primary/10 shadow-sm'
          : 'border-gray-100 hover:border-gray-200 hover:shadow-md'
      }`}
      draggable
      onDragStart={(e) => {
        if (onDragStartProp) {
          onDragStartProp(e, folder, 'folder');
        } else {
          e.dataTransfer.setData('application/json', JSON.stringify({ type: 'folder', id: folder.id }));
          e.dataTransfer.effectAllowed = 'move';
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (onDragOver) onDragOver(folder.id);
      }}
      onDragLeave={() => {
        if (onDragLeave) onDragLeave();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (onDrop) onDrop(e, folder.id);
      }}
      onDoubleClick={() => onOpen(folder.id)}
      onClick={(e) => {
        if ((e.ctrlKey || e.metaKey || e.shiftKey) && onSelect) {
          e.preventDefault();
          onSelect(folder.id, e);
        } else {
          onOpen(folder.id);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (onContextMenu) onContextMenu(e, folder);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="h-0.5 bg-indigo-400" />
      <div className="p-5">
        <div className="flex items-start gap-3">
          {/* Selection checkbox */}
          {onSelect && (
            <div className="flex-shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onSelect(folder.id)}
                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer"
              />
            </div>
          )}

          {/* Folder icon */}
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-500 transition-all duration-200">
            <i className={`fas ${hovered || isDragOver ? 'fa-folder-open' : 'fa-folder'} text-lg`}></i>
          </div>

          {/* Folder info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-dark-text truncate group-hover:text-primary transition-colors">
              {folder.name}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              {itemCount !== undefined && (
                <>
                  <span className="text-[11px] text-gray-400">
                    {itemCount} item{itemCount !== 1 ? 's' : ''}
                  </span>
                  <span className="text-gray-200">&middot;</span>
                </>
              )}
              {totalSize > 0 && (
                <>
                  <span className="text-[11px] text-gray-400">{formatSize(totalSize)}</span>
                  <span className="text-gray-200">&middot;</span>
                </>
              )}
              <span className="text-[11px] text-gray-400">{formatDate(folder.createdAt)}</span>
            </div>
            {showOwner && (folder.creatorEmail || folder.createdByEmail) && (
              <div className="flex items-center gap-1.5 mt-1">
                <i className="fas fa-user text-[9px] text-gray-300"></i>
                <span className="text-[10px] text-gray-400 truncate" title={folder.creatorEmail || folder.createdByEmail}>
                  {folder.creatorEmail || folder.createdByEmail}
                </span>
              </div>
            )}
          </div>

          <div className="flex-shrink-0 flex items-center gap-1">
            {onDelete && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(folder.id); }}
                className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md flex items-center justify-center text-red-500 hover:bg-red-50 transition-all duration-150"
                title="Delete folder"
              >
                <i className="fas fa-trash-alt text-[10px]"></i>
              </button>
            )}
            <i className="fas fa-chevron-right text-xs text-gray-300 group-hover:text-gray-400 transition-colors"></i>
          </div>
        </div>
      </div>
    </div>
  );
}
