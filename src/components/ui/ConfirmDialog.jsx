import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Button } from './button';
import DeleteProgressBar from './DeleteProgressBar';

export default function ConfirmDialog({
  open,
  title = 'Confirm Action',
  message = 'Are you sure you want to continue?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  progress = null,
  onConfirm,
  onCancel,
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !loading) onCancel?.();
      }}
    >
      <DialogContent
        onInteractOutside={(event) => {
          if (loading) {
            event.preventDefault();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (loading) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        {progress && (
          <div className="px-6 pb-4">
            <DeleteProgressBar job={progress} compact />
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={loading} onClick={onCancel}>
            {cancelLabel}
          </Button>
            <Button
              type="button"
              variant={tone === 'danger' ? 'destructive' : 'default'}
              disabled={loading}
              onClick={(event) => {
                event.preventDefault();
                onConfirm?.();
              }}
            >
              {loading ? <i className="fas fa-spinner fa-spin text-xs"></i> : null}
              {confirmLabel}
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
