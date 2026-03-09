import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import { useAuth } from '../contexts/AuthContext';
import { useAppToast } from '../hooks/useAppToast';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const ACCEPT_MEDIA = 'image/*,audio/*,video/*';
const ACCEPT_DOCS = 'application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.txt,.doc,.docx';
const ACCEPT_STRING = ACCEPT_MEDIA; // default; admins get ACCEPT_MEDIA + ACCEPT_DOCS
const MAX_FILES = 10;
const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB per chunk
const MAX_PARALLEL_CHUNKS = 3;
const CHUNK_UPLOAD_RETRIES = 2;
const CHUNK_RETRY_BASE_DELAY_MS = 400;
const COMPLETE_RETRIES = 4;
const EFFECTIVE_MAX_PARALLEL_CHUNKS = import.meta.env.PROD ? 1 : MAX_PARALLEL_CHUNKS;
const MAX_DESCRIPTION_LENGTH = 2000;

const SERVICE_CATEGORIES = [
  {
    label: 'Transcription Support',
    icon: 'fas fa-headset',
    children: ['Medical', 'Legal', 'General', 'Academic', 'Corporate/Business'],
  },
  {
    label: 'Data Entry',
    icon: 'fas fa-keyboard',
    children: ['Waybill/Invoice/Charge', 'Batch Proof Report'],
  },
  {
    label: 'EMR',
    icon: 'fas fa-laptop-medical',
    children: ['Data Entry & Digitalization', 'Data Migration', 'EMR Management'],
  },
  {
    label: 'Document Conversion',
    icon: 'fas fa-file-export',
    children: ['OCR & Data Extraction', 'File Format Conversion', 'Book and Ebook Conversion', 'Indexing & Redaction'],
  },
  {
    label: 'CAD',
    icon: 'fas fa-drafting-compass',
    children: ['Architectural Drafting', 'Structural Drafting', 'MEP & HVAC', '3D Visualization'],
  },
  {
    label: 'E-commerce Product Listing',
    icon: 'fas fa-shopping-cart',
    children: ['Data Cleaning & Validation', 'Data Extraction'],
  },
];

/* ------------------------------------------------------------------ */
/*  Utility helpers                                                    */
/* ------------------------------------------------------------------ */
const ADMIN_ALLOWED_DOC_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const ADMIN_ALLOWED_DOC_EXTENSIONS = new Set(['.pdf', '.txt', '.doc', '.docx']);

function isAllowedMime(mime, role, fileName = '') {
  const normalizedMime = String(mime || '').toLowerCase();
  const ext = fileName.includes('.') ? `.${fileName.split('.').pop().toLowerCase()}` : '';

  if (!normalizedMime) {
    return role === 'admin' && !!ext && ADMIN_ALLOWED_DOC_EXTENSIONS.has(ext);
  }
  if (normalizedMime.startsWith('image/') || normalizedMime.startsWith('audio/') || normalizedMime.startsWith('video/')) return true;
  if (role === 'admin') {
    if (ADMIN_ALLOWED_DOC_MIME_TYPES.has(normalizedMime)) return true;
    if (ext && ADMIN_ALLOWED_DOC_EXTENSIONS.has(ext)) return true;
  }
  return false;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatEta(seconds) {
  if (seconds < 1) return 'finishing...';
  if (seconds < 60) return `${Math.ceil(seconds)}s remaining`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return `${mins}m ${secs}s remaining`;
}

function getFileCategory(type) {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  if (type === 'application/pdf') return 'pdf';
  if (type.includes('word') || type === 'application/msword') return 'document';
  if (type.includes('excel') || type.includes('spreadsheet')) return 'spreadsheet';
  if (type.includes('powerpoint') || type.includes('presentation')) return 'presentation';
  if (type === 'text/plain' || type === 'text/csv') return 'text';
  return 'document';
}

function isValidUrl(str) {
  return /^https?:\/\/.+/i.test(str.trim());
}

function splitFileName(name) {
  const lastDot = name.lastIndexOf('.');
  if (lastDot <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, lastDot), ext: name.slice(lastDot) };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/*  FilePreview                                                        */
/* ------------------------------------------------------------------ */
function FilePreview({ file, onRemove, disabled, customName, onNameChange }) {
  const [preview, setPreview] = useState(null);
  const [editing, setEditing] = useState(false);
  const category = getFileCategory(file.type);

  // Extension is always locked to the original file — never editable
  const { base: originalBase, ext: fixedExt } = splitFileName(file.name);

  // Derive editable base from customName, stripping the fixed extension if present
  const getDisplayBase = (name) => {
    if (!name) return originalBase;
    if (fixedExt && name.endsWith(fixedExt)) return name.slice(0, -fixedExt.length);
    const { base } = splitFileName(name);
    return base || originalBase;
  };

  // Local state so the input can hold an empty string while the user is typing
  const [localBase, setLocalBase] = useState(() => getDisplayBase(customName));

  // Keep localBase in sync with external customName changes (but not while editing)
  useEffect(() => {
    if (!editing) {
      setLocalBase(getDisplayBase(customName));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customName, editing]);

  useEffect(() => {
    if (category === 'image') {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file, category]);

  const handleNameChange = (e) => {
    const newBase = e.target.value;
    setLocalBase(newBase);
    // Always append the fixed extension so the stored name is complete
    if (onNameChange) onNameChange(newBase + fixedExt);
  };

  const handleBlur = () => {
    setEditing(false);
    // If the user left the field empty, revert to the original filename base
    if (!localBase.trim()) {
      setLocalBase(originalBase);
      if (onNameChange) onNameChange(file.name);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  return (
    <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
      {/* Preview / Icon */}
      <div className={`w-14 h-14 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 ${
        category === 'image' && preview ? '' :
        category === 'audio' ? 'bg-sky-50' :
        category === 'video' ? 'bg-rose-50' :
        file.type === 'application/pdf' ? 'bg-red-50' :
        (file.type.includes('word') || file.type === 'application/msword') ? 'bg-blue-50' :
        (file.type.includes('excel') || file.type.includes('spreadsheet')) ? 'bg-green-50' :
        (file.type === 'text/plain' || file.type === 'text/csv') ? 'bg-gray-50' :
        'bg-gray-100'
      }`}>
        {category === 'image' && preview ? (
          <img src={preview} alt={localBase + fixedExt} className="w-full h-full object-cover" />
        ) : category === 'image' ? (
          <i className="fas fa-image text-violet-500 text-xl"></i>
        ) : category === 'audio' ? (
          <i className="fas fa-music text-sky-500 text-xl"></i>
        ) : category === 'video' ? (
          <i className="fas fa-video text-rose-500 text-xl"></i>
        ) : file.type === 'application/pdf' ? (
          <i className="fas fa-file-pdf text-red-500 text-xl"></i>
        ) : (file.type.includes('word') || file.type === 'application/msword') ? (
          <i className="fas fa-file-word text-blue-500 text-xl"></i>
        ) : (file.type.includes('excel') || file.type.includes('spreadsheet')) ? (
          <i className="fas fa-file-excel text-green-500 text-xl"></i>
        ) : (file.type === 'text/plain' || file.type === 'text/csv') ? (
          <i className="fas fa-file-alt text-gray-500 text-xl"></i>
        ) : (
          <i className="fas fa-file text-gray-400 text-xl"></i>
        )}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          {!disabled ? (
            <>
              <input
                type="text"
                value={localBase}
                onChange={handleNameChange}
                onFocus={() => setEditing(true)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className={`text-sm font-medium text-dark-text bg-transparent min-w-0 flex-1 truncate px-1.5 py-0.5 rounded-md outline-none transition-all ${
                  editing
                    ? 'border border-primary/40 ring-2 ring-primary/20 bg-white'
                    : 'border border-transparent hover:border-gray-200 hover:bg-gray-50'
                }`}
                title="Click to rename"
              />
              <span className="text-sm text-gray-400 flex-shrink-0">{fixedExt}</span>
            </>
          ) : (
            <p className="text-sm font-medium text-dark-text truncate">{localBase + fixedExt}</p>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-text">{formatSize(file.size)}</span>
          <span className="text-xs text-gray-300">|</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-primary/10 text-primary capitalize">
            {category}
          </span>
        </div>
      </div>

      {/* Remove button */}
      {!disabled && (
        <button
          type="button"
          onClick={onRemove}
          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          title="Remove file"
        >
          <i className="fas fa-times"></i>
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step Indicator                                                     */
/* ------------------------------------------------------------------ */
function StepIndicator({ steps, currentStep }) {
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 mb-10">
      {steps.map((step, idx) => {
        const stepNum = idx + 1;
        const isActive = stepNum === currentStep;
        const isCompleted = stepNum < currentStep;

        return (
          <div key={idx} className="flex items-center">
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                  isActive
                    ? 'bg-primary text-white shadow-lg shadow-primary/30 scale-110'
                    : isCompleted
                      ? 'bg-primary/20 text-primary'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {isCompleted ? (
                  <i className="fas fa-check text-xs"></i>
                ) : (
                  stepNum
                )}
              </div>
              <span
                className={`text-[10px] sm:text-xs mt-1.5 font-medium whitespace-nowrap transition-colors duration-300 ${
                  isActive
                    ? 'text-primary'
                    : isCompleted
                      ? 'text-primary/60'
                      : 'text-gray-400'
                }`}
              >
                {step}
              </span>
            </div>

            {/* Connector line */}
            {idx < steps.length - 1 && (
              <div
                className={`w-8 sm:w-14 h-0.5 mx-1 sm:mx-2 mb-5 rounded-full transition-colors duration-300 ${
                  stepNum < currentStep ? 'bg-primary/40' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Navigation Buttons                                                 */
/* ------------------------------------------------------------------ */
function WizardNav({ onBack, onNext, nextLabel, nextDisabled, showBack }) {
  return (
    <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
      {showBack ? (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-gray-text hover:text-dark-text transition-colors px-4 py-2.5 rounded-xl hover:bg-gray-50"
        >
          <i className="fas fa-arrow-left text-xs"></i>
          Back
        </button>
      ) : (
        <div />
      )}
      {onNext && (
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className="btn-gradient text-white px-8 py-3 rounded-xl text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-300 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>{nextLabel || 'Next'}</span>
          <i className="fas fa-arrow-right text-xs"></i>
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
export default function UploadPage() {
  const animationRef = useScrollAnimation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const folderId = searchParams.get('folderId') || null;
  const { getIdToken, role } = useAuth();
  const toast = useAppToast();
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  const handleCancelUpload = () => {
    abortControllerRef.current?.abort();
  };

  const handleBackNavigation = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(role === 'admin' ? '/admin/dashboard' : '/dashboard');
  };

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadMethod, setUploadMethod] = useState(null); // 'file' | 'url'

  // File upload state
  const [files, setFiles] = useState([]);
  const [fileNames, setFileNames] = useState({}); // index → custom name (with extension)
  const [dragActive, setDragActive] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);

  // URL upload state
  const [urls, setUrls] = useState([]);
  const [urlNames, setUrlNames] = useState({});  // index → custom display name
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');

  // Context / description state
  const [description, setDescription] = useState('');
  const [serviceCategory, setServiceCategory] = useState('');
  const [serviceCategoryMain, setServiceCategoryMain] = useState('');

  // Upload progress state
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState('');
  const [urlProcessingIndex, setUrlProcessingIndex] = useState(-1);

  // Result state
  const [result, setResult] = useState(null); // { type: 'success' | 'error', message: string }

  useEffect(() => {
    document.title = 'Upload Files - DigiScribe Transcription Corp.';
  }, []);

  useEffect(() => {
    if (!result?.message) return;
    if (result.type === 'success') {
      toast.success(result.message);
      return;
    }
    toast.error(result.message, 'Upload Failed');
  }, [result, toast]);

  // Warn users before closing tab while uploading
  useEffect(() => {
    if (!uploading) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [uploading]);

  /* ---- Step labels for the indicator ---- */
  const stepLabels = ['Method', uploadMethod === 'url' ? 'URLs' : 'Files', 'Details', 'Submit', 'Result'];

  /* ---- Helper: get display file name (custom or original) ---- */
  const getFileName = (index) => fileNames[index] || files[index]?.name || '';

  /* ---- Compute which logical step we are on (1-5) ---- */
  // Step 1 = Choose method
  // Step 2 = File upload (2A) or URL input (2B)
  // Step 3 = Description / context
  // Step 4 = Summary & submit
  // Step 5 = Result

  /* ================================================================ */
  /*  FILE HANDLING                                                    */
  /* ================================================================ */
  const validateFiles = useCallback((fileList) => {
    const errors = [];
    const valid = [];

    if (files.length + fileList.length > MAX_FILES) {
      errors.push(`You can upload a maximum of ${MAX_FILES} files at a time. You already have ${files.length} selected.`);
      return { valid: [], errors };
    }

    for (const file of fileList) {
      if (!isAllowedMime(file.type, role, file.name)) {
        const accepted = role === 'admin' ? 'images, audio, video, plus PDF/TXT/DOC/DOCX documents only' : 'images, audio, and video files only';
        errors.push(`"${file.name}" is not a supported file type. Accepted: ${accepted}.`);
      } else {
        valid.push(file);
      }
    }

    return { valid, errors };
  }, [files.length, role]);

  const addFiles = useCallback((fileList) => {
    const { valid, errors } = validateFiles(Array.from(fileList));
    setValidationErrors(errors);
    if (valid.length > 0) {
      const startIndex = files.length;
      const newNames = {};
      valid.forEach((f, i) => { newNames[startIndex + i] = f.name; });
      setFiles((prev) => [...prev, ...valid]);
      setFileNames((prevNames) => ({ ...prevNames, ...newNames }));
    }
  }, [validateFiles, files.length]);

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFileNames((prev) => {
      const updated = {};
      const keys = Object.keys(prev).map(Number).sort((a, b) => a - b);
      let newIdx = 0;
      for (const key of keys) {
        if (key === index) continue;
        updated[newIdx] = prev[key];
        newIdx++;
      }
      return updated;
    });
    setValidationErrors([]);
  };

  // Drag handlers
  const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); };
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };
  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    e.target.value = '';
  };

  /* ================================================================ */
  /*  URL HANDLING                                                     */
  /* ================================================================ */
  const addUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (!isValidUrl(trimmed)) {
      setUrlError('Please enter a valid URL starting with http:// or https://');
      return;
    }
    if (urls.includes(trimmed)) {
      setUrlError('This URL has already been added.');
      return;
    }
    setUrls((prev) => [...prev, trimmed]);
    setUrlInput('');
    setUrlError('');
  };

  const removeUrl = (index) => {
    setUrls((prev) => prev.filter((_, i) => i !== index));
    setUrlNames((prev) => {
      const updated = {};
      const keys = Object.keys(prev).map(Number).sort((a, b) => a - b);
      let newIdx = 0;
      for (const key of keys) {
        if (key === index) continue;
        updated[newIdx] = prev[key];
        newIdx++;
      }
      return updated;
    });
  };

  const handleUrlKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addUrl();
    }
  };

  /* ================================================================ */
  /*  UPLOAD LOGIC                                                     */
  /* ================================================================ */
  const handleUpload = async () => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setUploading(true);
    setResult(null);
    setProgress(0);
    setEta('');

    try {
      const token = await getIdToken();
      if (!token) throw new Error('Authentication required. Please log in again.');

      const authHeaders = { Authorization: `Bearer ${token}` };

      if (uploadMethod === 'file') {
        await uploadFiles(authHeaders, controller.signal);
      } else {
        await uploadUrls(authHeaders, controller.signal);
      }
    } catch (err) {
      if (err.name === 'AbortError' || err.message === '__CANCELLED__') {
        setProgress(0);
        setEta('');
        setUrlProcessingIndex(-1);
        // Stay on step 4 so the user can re-submit or go back
      } else {
        setResult({ type: 'error', message: err.message });
        setCurrentStep(5);
      }
    } finally {
      setUploading(false);
      abortControllerRef.current = null;
    }
  };

  const uploadFiles = async (authHeaders, signal) => {
    const filesToUpload = [...files];
    const totalSize = filesToUpload.reduce((sum, f) => sum + f.size, 0);
    let uploadedBytes = 0;
    const results = [];
    const startTime = Date.now();

    const updateProgress = () => {
      const pct = Math.round((uploadedBytes / totalSize) * 100);
      setProgress(pct);

      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed > 0.5 && uploadedBytes > 0) {
        const speed = uploadedBytes / elapsed;
        const remaining = (totalSize - uploadedBytes) / speed;
        setEta(formatEta(remaining));
      }
    };

    const uploadChunkWithRetry = async ({ file, uploadId, chunkIndex, customName }) => {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const blob = file.slice(start, end);

      for (let attempt = 0; attempt <= CHUNK_UPLOAD_RETRIES; attempt++) {
        const formData = new FormData();
        formData.append('chunk', blob);
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', String(chunkIndex));
        formData.append('chunkStart', String(start));

        const chunkRes = await fetch('/api/upload/chunk', {
          method: 'POST',
          headers: authHeaders,
          body: formData,
          signal,
        });

        if (chunkRes.ok) {
          return end - start;
        }

        const errData = await chunkRes.json().catch(() => ({}));
        const errMsg = errData.error || `Chunk upload failed for "${customName}".`;

        if (attempt === CHUNK_UPLOAD_RETRIES) {
          throw new Error(errMsg);
        }

        const backoff = CHUNK_RETRY_BASE_DELAY_MS * (attempt + 1);
        await wait(backoff);
      }

      return 0;
    };

    const completeUploadWithRetry = async ({ uploadId, fileName, totalChunks, mimeType }) => {
      for (let attempt = 0; attempt <= COMPLETE_RETRIES; attempt++) {
        const completeRes = await fetch('/api/upload/complete', {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadId,
            fileName,
            totalChunks,
            mimeType,
            description,
            serviceCategory,
            folderId,
          }),
          signal,
        });

        const completeData = await completeRes.json().catch(() => ({}));
        if (completeRes.ok && completeData.success) {
          return completeData;
        }

        const message = completeData.error || `Finalize failed for "${fileName}".`;
        if (attempt === COMPLETE_RETRIES) {
          throw new Error(message);
        }

        const backoff = CHUNK_RETRY_BASE_DELAY_MS * (attempt + 1);
        await wait(backoff);
      }

      throw new Error(`Finalize failed for "${fileName}".`);
    };

    for (let idx = 0; idx < filesToUpload.length; idx++) {
      const file = filesToUpload[idx];
      const customName = getFileName(idx);
      const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1;

      let nextChunkIndex = 0;
      const workerCount = Math.min(EFFECTIVE_MAX_PARALLEL_CHUNKS, totalChunks);
      const workers = Array.from({ length: workerCount }, async () => {
        while (nextChunkIndex < totalChunks) {
          const currentIndex = nextChunkIndex;
          nextChunkIndex += 1;

          const bytesUploaded = await uploadChunkWithRetry({
            file,
            uploadId,
            chunkIndex: currentIndex,
            customName,
          });

          uploadedBytes += bytesUploaded;
          updateProgress();
        }
      });

      await Promise.all(workers);

      const completeData = await completeUploadWithRetry({
        uploadId,
        fileName: customName,
        totalChunks,
        mimeType: file.type,
      });
      results.push(completeData.file);
    }

    setEta('');

    // Warn if any uploaded video is larger than 280 MB
    const LARGE_VIDEO_THRESHOLD = 280 * 1024 * 1024;
    const largeVideos = files.filter(
      (f) => f.type && f.type.startsWith('video/') && f.size > LARGE_VIDEO_THRESHOLD
    );
    if (largeVideos.length > 0) {
      setTimeout(() => {
        toast.warning(
          `${largeVideos.length > 1 ? `${largeVideos.length} videos are` : `"${fileNames[files.indexOf(largeVideos[0])] || largeVideos[0].name}" is`} over 280 MB and cannot be watched directly in the browser. Please download the file to view it.`,
          'Large Video Notice'
        );
      }, 800);
    }

    setResult({
      type: 'success',
      message: `${results.length} file${results.length !== 1 ? 's' : ''} uploaded successfully.`,
      hasLargeVideo: largeVideos.length > 0,
    });
    setCurrentStep(5);
  };

  const uploadUrls = async (authHeaders, signal) => {
    const results = [];
    const errors = [];

    for (let i = 0; i < urls.length; i++) {
      setUrlProcessingIndex(i);
      setProgress(Math.round(((i) / urls.length) * 100));

      try {
        const res = await fetch('/api/upload/url', {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urls[i], customName: urlNames[i] || '', description, serviceCategory, folderId }),
          signal,
        });
        const raw = await res.text();
        let data = {};
        if (raw) {
          try {
            data = JSON.parse(raw);
          } catch {
            data = { error: raw.slice(0, 180) };
          }
        }

        if (!res.ok || !data.success) {
          const fallback = raw
            ? `Request failed (${res.status} ${res.statusText}).`
            : `Request failed (${res.status} ${res.statusText}) with empty response.`;
          errors.push(`${urls[i]}: ${data.error || fallback}`);
        } else {
          results.push(data.file);
        }
      } catch (err) {
        // Re-throw abort errors so the outer handler can clean up
        if (err.name === 'AbortError') throw err;
        errors.push(`${urls[i]}: ${err.message}`);
      }
    }

    setProgress(100);
    setUrlProcessingIndex(-1);

    if (errors.length > 0 && results.length === 0) {
      setResult({ type: 'error', message: `All URL uploads failed.\n${errors.join('\n')}` });
    } else if (errors.length > 0) {
      setResult({
        type: 'success',
        message: `${results.length} URL${results.length !== 1 ? 's' : ''} processed successfully. ${errors.length} failed.`,
      });
    } else {
      setResult({
        type: 'success',
        message: `${results.length} URL${results.length !== 1 ? 's' : ''} processed successfully.`,
      });
    }
    setCurrentStep(5);
  };

  /* ================================================================ */
  /*  WIZARD NAVIGATION                                                */
  /* ================================================================ */
  const resetWizard = () => {
    setCurrentStep(1);
    setUploadMethod(null);
    setFiles([]);
    setFileNames({});
    setUrls([]);
    setUrlNames({});
    setUrlInput('');
    setUrlError('');
    setDescription('');
    setServiceCategory('');
    setServiceCategoryMain('');
    setValidationErrors([]);
    setResult(null);
    setProgress(0);
    setEta('');
    setUploading(false);
    setUrlProcessingIndex(-1);
  };

  const goBack = () => {
    if (currentStep === 2) {
      setCurrentStep(1);
      // Keep selected method but allow re-selection
    } else if (currentStep > 1) {
      setCurrentStep((s) => s - 1);
    }
  };

  const goNext = () => {
    if (currentStep < 5) {
      setCurrentStep((s) => s + 1);
    }
  };

  const canProceedFromStep2 = uploadMethod === 'file' ? files.length > 0 : urls.length > 0;

  /* ================================================================ */
  /*  STEP RENDERERS                                                   */
  /* ================================================================ */

  /* ---------- Step 1: Choose Method ---------- */
  const renderStep1 = () => (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-lg font-semibold text-dark-text">How would you like to upload?</h2>
        <p className="text-sm text-gray-text mt-1">Choose a method to get started</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Direct File Upload Card */}
        <button
          type="button"
          onClick={() => { setUploadMethod('file'); setCurrentStep(2); }}
          className={`group relative bg-white rounded-2xl border p-8 text-center transition-all duration-300 cursor-pointer hover:shadow-lg hover:-translate-y-1 ${
            uploadMethod === 'file'
              ? 'border-primary shadow-lg shadow-primary/10 ring-2 ring-primary/20'
              : 'border-gray-100 shadow-md hover:border-primary/30'
          }`}
        >
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 transition-colors duration-300 ${
            uploadMethod === 'file' ? 'bg-primary/20' : 'bg-gray-100 group-hover:bg-primary/10'
          }`}>
            <i className={`fas fa-cloud-upload-alt text-2xl transition-colors duration-300 ${
              uploadMethod === 'file' ? 'text-primary' : 'text-gray-400 group-hover:text-primary'
            }`}></i>
          </div>
          <h3 className="text-base font-semibold text-dark-text mb-2">Direct File Upload</h3>
          <p className="text-xs text-gray-text leading-relaxed">
            Drag and drop or browse files from your device. Supports images, audio, and video{role === 'admin' ? ', plus PDF & documents for documentation' : ''}.
          </p>
        </button>

        {/* URL Upload Card */}
        <button
          type="button"
          onClick={() => { setUploadMethod('url'); setCurrentStep(2); }}
          className={`group relative bg-white rounded-2xl border p-8 text-center transition-all duration-300 cursor-pointer hover:shadow-lg hover:-translate-y-1 ${
            uploadMethod === 'url'
              ? 'border-primary shadow-lg shadow-primary/10 ring-2 ring-primary/20'
              : 'border-gray-100 shadow-md hover:border-primary/30'
          }`}
        >
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 transition-colors duration-300 ${
            uploadMethod === 'url' ? 'bg-primary/20' : 'bg-gray-100 group-hover:bg-primary/10'
          }`}>
            <i className={`fas fa-link text-2xl transition-colors duration-300 ${
              uploadMethod === 'url' ? 'text-primary' : 'text-gray-400 group-hover:text-primary'
            }`}></i>
          </div>
          <h3 className="text-base font-semibold text-dark-text mb-2">Upload via URL</h3>
          <p className="text-xs text-gray-text leading-relaxed">
            Provide links to files hosted online. We will download and process them for you.
          </p>
        </button>
      </div>
    </div>
  );

  /* ---------- Step 2A: File Upload ---------- */
  const renderStep2Files = () => (
    <div>
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-dark-text">Select Your Files</h2>
        <p className="text-sm text-gray-text mt-1">
          Upload up to {MAX_FILES} {role === 'admin' ? 'media or allowed document (PDF/TXT/DOC/DOCX)' : 'image, audio, or video'} files
        </p>
      </div>

      {/* Instructions */}
      <div className="mb-6 p-4 bg-sky-50 rounded-xl border border-sky-100">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
            <i className="fas fa-info-circle text-primary text-sm"></i>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-dark-text mb-1.5">Supported Formats</h3>
            <ul className="text-xs text-gray-text space-y-1 leading-relaxed">
              <li><i className="fas fa-check text-primary mr-2"></i><strong>Images:</strong> JPG, PNG, GIF, WebP, BMP, SVG, HEIC, AVIF, JFIF, etc.</li>
              <li><i className="fas fa-check text-primary mr-2"></i><strong>Audio:</strong> MP3, WAV, OGG, AAC, FLAC, M4A, OPUS, AIFF, etc.</li>
              <li><i className="fas fa-check text-primary mr-2"></i><strong>Video:</strong> MP4, WebM, MOV, AVI, MKV, WMV, FLV, etc.</li>
              <li><i className="fas fa-triangle-exclamation text-amber-500 mr-2"></i><strong>Videos over 280 MB</strong> cannot be streamed in-browser &mdash; you&apos;ll need to download them to view.</li>
              {role === 'admin' && (
                <li><i className="fas fa-check text-primary mr-2"></i><strong>Documents (admin):</strong> PDF, DOC/DOCX, TXT</li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Drag & Drop Zone */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 ${
          dragActive
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-gray-200 hover:border-primary/50 hover:bg-gray-50'
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={role === 'admin' ? `${ACCEPT_MEDIA},${ACCEPT_DOCS}` : ACCEPT_MEDIA}
          onChange={handleFileInput}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-3">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
            dragActive ? 'bg-primary/20' : 'bg-gray-100'
          }`}>
            <i className={`fas fa-cloud-upload-alt text-2xl ${dragActive ? 'text-primary' : 'text-gray-400'}`}></i>
          </div>
          <div>
            <p className="text-sm font-medium text-dark-text">
              {dragActive ? 'Drop your files here' : 'Drag & drop files here'}
            </p>
            <p className="text-xs text-gray-text mt-1">
              or <span className="text-primary font-medium">browse from your device</span>
            </p>
          </div>
        </div>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-100">
          <div className="flex items-start gap-3">
            <i className="fas fa-exclamation-circle text-red-500 mt-0.5"></i>
            <div>
              {validationErrors.map((error, i) => (
                <p key={i} className="text-xs text-red-600">{error}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-dark-text">
              Selected Files ({files.length}/{MAX_FILES})
            </p>
            <button
              type="button"
              onClick={() => { setFiles([]); setFileNames({}); setValidationErrors([]); }}
              className="text-xs text-gray-text hover:text-red-500 transition-colors"
            >
              Clear All
            </button>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {files.map((file, index) => (
              <FilePreview
                key={`${file.name}-${file.size}-${index}`}
                file={file}
                onRemove={() => removeFile(index)}
                disabled={false}
                customName={fileNames[index]}
                onNameChange={(newName) => setFileNames((prev) => ({ ...prev, [index]: newName }))}
              />
            ))}
          </div>
        </div>
      )}

      <WizardNav
        showBack={true}
        onBack={goBack}
        onNext={goNext}
        nextLabel="Continue"
        nextDisabled={files.length === 0}
      />
    </div>
  );

  /* ---------- Step 2B: URL Input ---------- */
  const renderStep2Urls = () => (
    <div>
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-dark-text">Add File URLs</h2>
        <p className="text-sm text-gray-text mt-1">
          Enter the URLs of files you want us to download and process
        </p>
      </div>

      {/* URL Input */}
      <div className="flex gap-3">
        <div className="flex-1">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => { setUrlInput(e.target.value); setUrlError(''); }}
            onKeyDown={handleUrlKeyDown}
            placeholder="https://example.com/file.mp3"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-dark-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          />
        </div>
        <button
          type="button"
          onClick={addUrl}
          className="btn-gradient text-white px-6 py-3 rounded-xl text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-300 flex items-center gap-2 flex-shrink-0"
        >
          <i className="fas fa-plus text-xs"></i>
          Add
        </button>
      </div>

      {/* URL Error */}
      {urlError && (
        <p className="mt-2 text-xs text-red-500 flex items-center gap-1.5">
          <i className="fas fa-exclamation-circle"></i>
          {urlError}
        </p>
      )}

      {/* URL List */}
      {urls.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-medium text-dark-text mb-3">
            Added URLs ({urls.length})
          </p>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {urls.map((url, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <i className="fas fa-link text-primary text-sm"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={urlNames[index] || ''}
                    onChange={(e) => setUrlNames((prev) => ({ ...prev, [index]: e.target.value }))}
                    placeholder="Enter a name for this file"
                    className="w-full text-sm font-medium text-dark-text bg-transparent px-1.5 py-0.5 rounded-md outline-none border border-transparent hover:border-gray-200 hover:bg-gray-50 focus:border-primary/40 focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all"
                  />
                  <p className="text-xs text-gray-text truncate mt-0.5 px-1.5" title={url}>
                    {url}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeUrl(index)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                  title="Remove URL"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {urls.length === 0 && (
        <div className="mt-8 text-center py-8 bg-gray-50 rounded-xl border border-gray-100">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <i className="fas fa-link text-gray-400 text-lg"></i>
          </div>
          <p className="text-sm text-gray-text">No URLs added yet</p>
          <p className="text-xs text-gray-400 mt-1">Enter a URL above and click Add</p>
        </div>
      )}

      <WizardNav
        showBack={true}
        onBack={goBack}
        onNext={goNext}
        nextLabel="Continue"
        nextDisabled={urls.length === 0}
      />
    </div>
  );

  /* ---------- Step 3: Details / Service Category + Description ---------- */
  const handleMainCategoryChange = (main) => {
    setServiceCategoryMain(main);
    const cat = SERVICE_CATEGORIES.find((c) => c.label === main);
    if (cat && cat.children.length === 0) {
      setServiceCategory(main);
    } else {
      setServiceCategory('');
    }
  };

  const handleSubCategoryChange = (sub) => {
    if (serviceCategoryMain && sub) {
      setServiceCategory(`${serviceCategoryMain} - ${sub}`);
    } else {
      setServiceCategory('');
    }
  };

  const selectedMainCategory = SERVICE_CATEGORIES.find((c) => c.label === serviceCategoryMain);

  const renderStep3 = () => (
    <div>
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-dark-text">Service & Context</h2>
        <p className="text-sm text-gray-text mt-1">
          Select a service category and add any special instructions
        </p>
      </div>

      {/* Service Category Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-dark-text mb-2">
          Service Category <span className="text-red-500">*</span>
        </label>

        {/* Main Category */}
        <select
          value={serviceCategoryMain}
          onChange={(e) => handleMainCategoryChange(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-dark-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all mb-3"
        >
          <option value="">Select a service...</option>
          {SERVICE_CATEGORIES.map((cat) => (
            <option key={cat.label} value={cat.label}>{cat.label}</option>
          ))}
        </select>

        {/* Sub Category */}
        {selectedMainCategory && selectedMainCategory.children.length > 0 && (
          <select
            value={serviceCategory ? serviceCategory.replace(`${serviceCategoryMain} - `, '') : ''}
            onChange={(e) => handleSubCategoryChange(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-dark-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          >
            <option value="">Select a sub-category...</option>
            {selectedMainCategory.children.map((sub) => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>
        )}

        {/* Selected badge */}
        {serviceCategory && (
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium border border-indigo-100">
            <i className={`${selectedMainCategory?.icon || 'fas fa-tag'} text-indigo-500`}></i>
            {serviceCategory}
          </div>
        )}
      </div>

      {/* Description */}
      <div className="relative">
        <label
          htmlFor="description"
          className="block text-sm font-medium text-dark-text mb-2"
        >
          Notes / Instructions <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => {
            if (e.target.value.length <= MAX_DESCRIPTION_LENGTH) {
              setDescription(e.target.value);
            }
          }}
          rows={4}
          placeholder="e.g., This is a recorded interview between two speakers. Please include timestamps every 30 seconds..."
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-dark-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-gray-400">
            This helps improve transcription accuracy
          </p>
          <span className={`text-xs font-medium ${
            description.length > MAX_DESCRIPTION_LENGTH * 0.9 ? 'text-amber-500' : 'text-gray-400'
          }`}>
            {description.length}/{MAX_DESCRIPTION_LENGTH}
          </span>
        </div>
      </div>

      {/* Quick tips */}
      <div className="mt-6 p-4 bg-sky-50 rounded-xl border border-sky-100">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
            <i className="fas fa-lightbulb text-primary text-sm"></i>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-dark-text mb-1.5">Tips for Better Results</h3>
            <ul className="text-xs text-gray-text space-y-1 leading-relaxed">
              <li><i className="fas fa-chevron-right text-primary/60 mr-2 text-[10px]"></i>Mention the number of speakers if known</li>
              <li><i className="fas fa-chevron-right text-primary/60 mr-2 text-[10px]"></i>Note any specialized terminology or jargon</li>
              <li><i className="fas fa-chevron-right text-primary/60 mr-2 text-[10px]"></i>Specify desired format (timestamps, speaker labels, etc.)</li>
              <li><i className="fas fa-chevron-right text-primary/60 mr-2 text-[10px]"></i>Mention the language if not English</li>
            </ul>
          </div>
        </div>
      </div>

      <WizardNav
        showBack={true}
        onBack={goBack}
        onNext={goNext}
        nextLabel="Review Summary"
        nextDisabled={!serviceCategory}
      />
    </div>
  );

  /* ---------- Step 4: Summary & Submit ---------- */
  const renderStep4 = () => {
    const totalSize = uploadMethod === 'file'
      ? files.reduce((sum, f) => sum + f.size, 0)
      : null;

    return (
      <div>
        <div className="text-center mb-6">
          <h2 className="text-lg font-semibold text-dark-text">Review & Submit</h2>
          <p className="text-sm text-gray-text mt-1">
            Please review your upload details before submitting
          </p>
        </div>

        {/* Summary Card */}
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-6 space-y-5">
          {/* Upload method */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <i className={`fas ${uploadMethod === 'file' ? 'fa-cloud-upload-alt' : 'fa-link'} text-primary`}></i>
            </div>
            <div>
              <p className="text-xs text-gray-text">Upload Method</p>
              <p className="text-sm font-medium text-dark-text">
                {uploadMethod === 'file' ? 'Direct File Upload' : 'Upload via URL'}
              </p>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* File / URL count */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <i className={`fas ${uploadMethod === 'file' ? 'fa-copy' : 'fa-list'} text-primary`}></i>
            </div>
            <div>
              <p className="text-xs text-gray-text">
                {uploadMethod === 'file' ? 'Files' : 'URLs'}
              </p>
              <p className="text-sm font-medium text-dark-text">
                {uploadMethod === 'file'
                  ? `${files.length} file${files.length !== 1 ? 's' : ''} (${formatSize(totalSize)})`
                  : `${urls.length} URL${urls.length !== 1 ? 's' : ''}`
                }
              </p>
            </div>
          </div>

          {/* File/URL details */}
          <div className="ml-13 pl-0.5">
            {uploadMethod === 'file' ? (
              <div className="space-y-1.5">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-text">
                    <i className={`fas ${
                      getFileCategory(f.type) === 'image' ? 'fa-image' :
                      getFileCategory(f.type) === 'audio' ? 'fa-music' :
                      getFileCategory(f.type) === 'video' ? 'fa-video' :
                      getFileCategory(f.type) === 'pdf' ? 'fa-file-pdf' :
                      getFileCategory(f.type) === 'document' ? 'fa-file-word' :
                      getFileCategory(f.type) === 'spreadsheet' ? 'fa-file-excel' :
                      getFileCategory(f.type) === 'presentation' ? 'fa-file-powerpoint' :
                      getFileCategory(f.type) === 'text' ? 'fa-file-alt' : 'fa-file'
                    } text-primary/60 w-4`}></i>
                    <span className="truncate">{getFileName(i)}</span>
                    <span className="text-gray-300 flex-shrink-0">({formatSize(f.size)})</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {urls.map((url, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-text">
                    <i className="fas fa-link text-primary/60 w-4"></i>
                    <span className="truncate">{urlNames[i] || url}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Service Category */}
          {serviceCategory && (
            <>
              <hr className="border-gray-200" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <i className="fas fa-tag text-indigo-600"></i>
                </div>
                <div>
                  <p className="text-xs text-gray-text">Service Category</p>
                  <p className="text-sm font-medium text-dark-text">{serviceCategory}</p>
                </div>
              </div>
            </>
          )}

          {/* Description preview */}
          {description.trim() && (
            <>
              <hr className="border-gray-200" />
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <i className="fas fa-align-left text-primary"></i>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-text">Description / Instructions</p>
                  <p className="text-sm text-dark-text mt-1 whitespace-pre-wrap break-words leading-relaxed">
                    {description.length > 300
                      ? `${description.slice(0, 300)}...`
                      : description
                    }
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Upload progress (visible during upload) */}
        {uploading && (
          <div className="mt-6">
            {uploadMethod === 'file' ? (
              /* File upload progress bar */
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-text font-medium">Uploading files...</span>
                  <span className="text-sm font-semibold text-primary">{progress}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-400 to-primary rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                {eta && (
                  <p className="text-xs text-gray-text mt-2 flex items-center gap-1.5">
                    <i className="fas fa-clock text-primary/60"></i>
                    {eta}
                  </p>
                )}
              </div>
            ) : (
              /* URL processing state */
              <div className="text-center py-4">
                <div className="flex items-center justify-center gap-3 mb-3">
                  <i className="fas fa-spinner fa-spin text-primary text-lg"></i>
                  <span className="text-sm font-medium text-dark-text">Processing URLs...</span>
                </div>
                <p className="text-xs text-gray-text">
                  {urlProcessingIndex >= 0 && urlProcessingIndex < urls.length
                    ? `Processing URL ${urlProcessingIndex + 1} of ${urls.length}`
                    : 'Preparing...'
                  }
                </p>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden mt-3 max-w-sm mx-auto">
                  <div
                    className="h-full bg-gradient-to-r from-sky-400 to-primary rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Cancel button */}
            <div className="flex justify-center mt-5">
              <button
                type="button"
                onClick={handleCancelUpload}
                className="flex items-center gap-2 text-sm font-medium text-red-500 hover:text-red-600 border border-red-200 hover:border-red-300 hover:bg-red-50 px-5 py-2.5 rounded-xl transition-all duration-200"
              >
                <i className="fas fa-times text-xs"></i>
                Cancel Upload
              </button>
            </div>
          </div>
        )}

        {/* Submit button (hidden during upload) */}
        {!uploading && (
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-2 text-sm font-medium text-gray-text hover:text-dark-text transition-colors px-4 py-2.5 rounded-xl hover:bg-gray-50"
            >
              <i className="fas fa-arrow-left text-xs"></i>
              Back
            </button>
            <button
              type="button"
              onClick={handleUpload}
              className="btn-gradient text-white px-10 py-3.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-300 flex items-center gap-2"
            >
              <i className="fas fa-upload"></i>
              <span>Submit Upload</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  /* ---------- Step 5: Result ---------- */
  const renderStep5 = () => (
    <div className="text-center py-4">
      {result?.type === 'success' ? (
        <>
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <i className="fas fa-check-circle text-green-500 text-4xl"></i>
          </div>
          <h2 className="text-xl font-semibold text-dark-text mb-2">Upload Successful</h2>
          <p className="text-sm text-gray-text max-w-md mx-auto whitespace-pre-wrap">
            {result.message}
          </p>
          {result.hasLargeVideo && (
            <div className="mt-5 mx-auto max-w-md flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-left">
              <i className="fas fa-triangle-exclamation text-amber-500 text-sm mt-0.5 flex-shrink-0"></i>
              <p className="text-xs text-amber-700 leading-relaxed">
                <strong>Large video notice:</strong> One or more of your videos is over 280 MB and cannot be streamed directly in the browser. You&apos;ll need to <strong>download the file</strong> to watch it.
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <i className="fas fa-times-circle text-red-500 text-4xl"></i>
          </div>
          <h2 className="text-xl font-semibold text-dark-text mb-2">Upload Failed</h2>
          <p className="text-sm text-red-600 max-w-md mx-auto whitespace-pre-wrap">
            {result?.message || 'An unexpected error occurred.'}
          </p>
        </>
      )}

      <div className="flex items-center justify-center gap-4 mt-8">
        <button
          type="button"
          onClick={resetWizard}
          className="px-6 py-3 rounded-xl text-sm font-semibold border border-gray-200 text-dark-text hover:bg-gray-50 transition-all duration-300 flex items-center gap-2"
        >
          <i className="fas fa-redo text-xs"></i>
          Upload More
        </button>
        <button
          type="button"
          onClick={() => navigate(role === 'admin' ? '/admin/dashboard' : '/dashboard')}
          className="btn-gradient text-white px-6 py-3 rounded-xl text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-300 flex items-center gap-2"
        >
          <i className="fas fa-columns text-xs"></i>
          Go to Dashboard
        </button>
      </div>
    </div>
  );

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return renderStep1();
      case 2:
        return uploadMethod === 'file' ? renderStep2Files() : renderStep2Urls();
      case 3:
        return renderStep3();
      case 4:
        return renderStep4();
      case 5:
        return renderStep5();
      default:
        return renderStep1();
    }
  };

  const heroContent = (
    <main className="relative z-10 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <button
            type="button"
            onClick={handleBackNavigation}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-text hover:text-primary transition-colors mb-3"
          >
            <i className="fas fa-arrow-left text-xs"></i>
            Back
          </button>
          <h1 className="text-2xl md:text-3xl font-semibold gradient-text">
            Upload Files
          </h1>
          <p className="text-sm text-gray-text mt-1">
            Upload your files for transcription in a few simple steps.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
          <div className="p-8 lg:p-12">
            {/* Step Indicator */}
            <StepIndicator steps={stepLabels} currentStep={currentStep} />

            {/* Step Content with transition */}
            <div className="min-h-[340px]">
              {renderCurrentStep()}
            </div>
          </div>
        </div>
      </div>
    </main>
  );

  return (
    <Layout heroContent={heroContent} hideFooter>
      <div ref={animationRef} />
    </Layout>
  );
}
