function formatRelativeDate(dateString) {
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
  if (!bytes || bytes === 0) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function FolderRow({
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
  showUploadedBy = true,
  onDelete,
}) {
  return (
    <tr
      className={`transition-colors cursor-pointer ${
        isDragOver
          ? 'bg-primary/10'
          : isSelected
          ? 'bg-primary/[0.03]'
          : 'hover:bg-gray-50/50'
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
    >
      <td className="text-center px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(folder.id)}
          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer"
        />
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-500">
            <i className="fas fa-folder text-xs"></i>
          </div>
          <div className="min-w-0">
            <span className="text-sm font-medium text-dark-text truncate block max-w-[200px] hover:text-primary transition-colors">
              {folder.name}
            </span>
            {itemCount !== undefined && (
              <p className="text-[10px] text-gray-400 mt-0.5">
                {itemCount} item{itemCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <span className="text-xs text-gray-text">Folder</span>
      </td>
      <td className="px-4 py-3.5">
        <span className="text-sm text-gray-400">--</span>
      </td>
      {showUploadedBy && (
        <td className="px-4 py-3.5">
          <span className="text-sm text-gray-text" title={folder.creatorEmail || folder.createdByEmail || '--'}>
            {folder.creatorEmail || folder.createdByEmail || '--'}
          </span>
        </td>
      )}
      <td className="px-4 py-3.5">
        <span className="text-sm text-gray-text">{formatRelativeDate(folder.createdAt)}</span>
      </td>
      <td className="px-4 py-3.5">
        <span className="text-sm text-gray-text">{totalSize > 0 ? formatSize(totalSize) : '--'}</span>
      </td>
      <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(folder.id);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
            title="Open folder"
          >
            <i className="fas fa-folder-open text-[10px]"></i>
            Open
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(folder.id); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors"
              title="Delete folder"
            >
              <i className="fas fa-trash-alt text-[10px]"></i>
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
