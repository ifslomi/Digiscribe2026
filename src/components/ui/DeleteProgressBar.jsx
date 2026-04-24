function formatDuration(ms) {
  if (ms == null) return 'Calculating...';
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 1) return 'less than 1s';

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

export default function DeleteProgressBar({ job, compact = false, showBackgroundNote = false }) {
  if (!job) return null;

  const progress = job.progress || {};
  const percent = Number.isFinite(progress.percent) ? Math.max(0, Math.min(100, progress.percent)) : 0;
  const total = Number(progress.total) || 0;
  const completed = Number(progress.completed) || 0;
  const etaLabel = progress.etaMs == null ? 'Estimating...' : `ETA ${formatDuration(progress.etaMs)}`;
  const elapsedLabel = `Elapsed ${formatDuration(progress.elapsedMs)}`;
  const countLabel = total > 0 ? `${completed}/${total}` : `${completed}`;

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-dark-text truncate">
            {progress.phase || 'Deleting items'}
          </p>
          <p className="text-xs text-gray-text truncate">
            {progress.detail || 'Working through the delete queue...'}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-primary">{Math.round(percent)}%</p>
          <p className="text-[11px] text-gray-400">{countLabel} processed</p>
        </div>
      </div>

      <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-sky-400 to-primary rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-3 text-[11px] text-gray-500">
        <span>{elapsedLabel}</span>
        <span>{etaLabel}</span>
      </div>

      {showBackgroundNote && (
        <p className="text-[11px] text-gray-500">
          You can close this tab. The delete continues in the background.
        </p>
      )}
    </div>
  );
}