import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/button';
import { Card } from '../ui/card';

export default function CreateFolderModal({
  isOpen,
  onClose,
  onCreateFolder,
  parentFolderId,
  title = 'New Folder',
  subtitle = 'Create a new folder to organize your files',
  submitLabel = 'Create Folder',
}) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (loading) return;
      onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await onCreateFolder(name.trim(), parentFolderId);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <Card className="relative rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
            <i className="fas fa-folder-plus text-indigo-500"></i>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-dark-text">{title}</h2>
            <p className="text-xs text-gray-text">{subtitle}</p>
          </div>
          <Button
            type="button"
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="ml-auto text-gray-400 hover:text-gray-600"
          >
            <i className="fas fa-times"></i>
          </Button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-dark-text mb-1.5">Folder Name</label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter folder name..."
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-dark-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-100 flex items-center gap-2">
              <i className="fas fa-exclamation-circle text-red-500 text-xs"></i>
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-3 justify-end">
            <Button
              type="button"
              onClick={onClose}
              disabled={loading}
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim()}
              variant="default"
              className="inline-flex items-center gap-2"
            >
              {loading ? (
                <i className="fas fa-spinner fa-spin text-xs"></i>
              ) : (
                <i className="fas fa-plus text-xs"></i>
              )}
              {submitLabel}
            </Button>
          </div>
        </form>
      </Card>
    </div>,
    document.body
  );
}
