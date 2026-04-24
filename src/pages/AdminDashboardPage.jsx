import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fileUrl, fileDownloadUrl } from '../lib/fileUrl';
import Layout from '../components/layout/Layout';
import FolderRow from '../components/dashboard/FolderRow';
import FolderCard from '../components/dashboard/FolderCard';
import FileCard from '../components/dashboard/FileCard';
import Breadcrumbs from '../components/dashboard/Breadcrumbs';
import CreateFolderModal from '../components/dashboard/CreateFolderModal';
import MoveFolderModal from '../components/dashboard/MoveFolderModal';
import FilePreviewModal from '../components/dashboard/FilePreviewModal';
import FilePropertiesModal from '../components/dashboard/FilePropertiesModal';
import FolderPropertiesModal from '../components/dashboard/FolderPropertiesModal';
import ContextMenu from '../components/dashboard/ContextMenu';
import DocumentViewerModal from '../components/dashboard/DocumentViewerModal';
import FolderFilterToolbar from '../components/dashboard/FolderFilterToolbar';
import { ServicePicker, SERVICE_TREE } from '../components/dashboard/FolderFilterToolbar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import RenameDialog from '../components/ui/RenameDialog';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent } from '../components/ui/dialog';
import CreateUserForm from '../components/admin/CreateUserForm';
import UserTable from '../components/admin/UserTable';
import { useFirestoreFiles } from '../hooks/useFirestoreFiles';
import { useFolders } from '../hooks/useFolders';
import { useFolderActions } from '../hooks/useFolderActions';
import { useTranscriptions } from '../hooks/useTranscriptions';
import { useAdminUsers } from '../hooks/useAdminUsers';
import { useAppToast } from '../hooks/useAppToast';
import { useAuth } from '../contexts/AuthContext';

const TABS = [
  { id: 'files', label: 'Files', icon: 'fa-folder-open' },
  { id: 'users', label: 'Users', icon: 'fa-users-gear' },
];

const STATUS_OPTIONS = ['pending', 'in-progress', 'transcribed'];

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    icon: 'fa-clock',
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    border: 'border-amber-200',
    ring: 'ring-amber-400',
    iconBg: 'bg-amber-100',
    dot: 'bg-amber-400',
  },
  'in-progress': {
    label: 'In Progress',
    icon: 'fa-arrows-rotate',
    bg: 'bg-sky-50',
    text: 'text-sky-600',
    border: 'border-sky-200',
    ring: 'ring-sky-400',
    iconBg: 'bg-sky-100',
    dot: 'bg-sky-400',
  },
  transcribed: {
    label: 'Transcribed',
    icon: 'fa-check-circle',
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    border: 'border-emerald-200',
    ring: 'ring-emerald-400',
    iconBg: 'bg-emerald-100',
    dot: 'bg-emerald-400',
  },
};

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name-asc', label: 'Name A-Z' },
  { value: 'name-desc', label: 'Name Z-A' },
  { value: 'size', label: 'Largest First' },
];

const ADMIN_DASHBOARD_STATE_PREFIX = 'admin-dashboard-files-state-v1';
const ADMIN_DASHBOARD_PAGE_SIZE = 15;

function getAdminDashboardStateKey(userId) {
  return `${ADMIN_DASHBOARD_STATE_PREFIX}:${userId || 'admin'}`;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function formatSize(bytes) {
  if (!bytes) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  try {
    const d = new Date(dateStr);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  } catch {
    return '--';
  }
}

function getUploadedByLabel(file) {
  if (!file) return '--';
  return file.uploaderEmail || file.uploadedByEmail || '--';
}

function formatRelativeDate(dateString) {
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

function getPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [];
  pages.push(1);
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) pages.push('...');
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push('...');
  pages.push(total);
  return pages;
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

const PLATFORM_MAP = [
  { pattern: /youtu\.?be/i, label: 'YouTube', icon: 'fa-brands fa-youtube', color: 'text-red-600 bg-red-50' },
  { pattern: /facebook\.com|fb\.com|fb\.watch/i, label: 'Facebook', icon: 'fa-brands fa-facebook-f', color: 'text-blue-600 bg-blue-50' },
  { pattern: /dailymotion\.com|dai\.ly/i, label: 'Dailymotion', icon: 'fas fa-play', color: 'text-sky-600 bg-sky-50' },
  { pattern: /drive\.google\.com|docs\.google\.com/i, label: 'Google Drive', icon: 'fa-brands fa-google-drive', color: 'text-emerald-600 bg-emerald-50' },
  { pattern: /instagram\.com/i, label: 'Instagram', icon: 'fa-brands fa-instagram', color: 'text-pink-600 bg-pink-50' },
  { pattern: /tiktok\.com/i, label: 'TikTok', icon: 'fa-brands fa-tiktok', color: 'text-gray-900 bg-gray-100' },
  { pattern: /twitter\.com|x\.com/i, label: 'Twitter/X', icon: 'fa-brands fa-x-twitter', color: 'text-gray-800 bg-gray-100' },
  { pattern: /vimeo\.com/i, label: 'Vimeo', icon: 'fa-brands fa-vimeo-v', color: 'text-sky-600 bg-sky-50' },
  { pattern: /soundcloud\.com/i, label: 'SoundCloud', icon: 'fa-brands fa-soundcloud', color: 'text-orange-600 bg-orange-50' },
  { pattern: /twitch\.tv/i, label: 'Twitch', icon: 'fa-brands fa-twitch', color: 'text-violet-600 bg-violet-50' },
];

function getUrlPlatform(sourceUrl) {
  if (!sourceUrl) return { label: 'URL', icon: 'fa-link', color: 'text-gray-600 bg-gray-100' };
  return PLATFORM_MAP.find((p) => p.pattern.test(sourceUrl)) || { label: 'URL', icon: 'fa-link', color: 'text-gray-600 bg-gray-100' };
}

/* ─────────────────────────── Files Tab ─────────────────────────── */

function FilesTab({
  allFiles,
  allFolders,
  filesLoading,
  filesError,
  foldersLoading,
  folderActions,
  refetchFolders,
  onScopeChange,
}) {
  const { user, getIdToken } = useAuth();
  const toast = useAppToast();
  const { createFolder, renameFolder, moveFolder, deleteFolder, moveFileToFolder } = folderActions;

  const [statusFilter, setStatusFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState([]);
  const [sortBy, setSortBy] = useState('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState('');

  // Folder-level filters (only active when inside a folder)
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'list';
    const saved = window.localStorage.getItem('admin-dashboard-view-mode');
    return saved === 'grid' ? 'grid' : 'list';
  });
  const [message, setMessage] = useState(null);
  const [statusLoading, setStatusLoading] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(null);
  const [downloadLoadingKey, setDownloadLoadingKey] = useState('');
  const [previewFile, setPreviewFile] = useState(null);
  const [propertiesFile, setPropertiesFile] = useState(null);
  const [propertiesFolder, setPropertiesFolder] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const dashboardStateHydratedRef = useRef(false);
  const lastAnchorId = useRef(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [deleteAllDevConfirm, setDeleteAllDevConfirm] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMoveActive, setBulkMoveActive] = useState(false);
  const [bulkStatusTarget, setBulkStatusTarget] = useState(null); // status to apply in bulk

  // Context menu state
  const [contextMenu, setContextMenu] = useState(null);

  // User scope (virtual per-user folder layer for admin)
  const [selectedUserEmail, setSelectedUserEmail] = useState(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userPage, setUserPage] = useState(1);

  // Root view mode: 'users' = per-user folders, 'general' = all files combined
  const [rootViewMode, setRootViewMode] = useState('general');

  // Folder state
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [moveTarget, setMoveTarget] = useState(null);
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragOverFolder, setDragOverFolder] = useState(null);
  const [dragOverBreadcrumb, setDragOverBreadcrumb] = useState(null); // 'root' | 'user' | folderId
  const [deleteFolderConfirm, setDeleteFolderConfirm] = useState(null);
  const [isDraggingAny, setIsDraggingAny] = useState(false);

  // File rename state
  const [renamingFileId, setRenamingFileId] = useState(null);
  const [renameFileValue, setRenameFileValue] = useState('');
  const [renameFileExt, setRenameFileExt] = useState('');

  // Transcription attachment state
  const [transcriptionTarget, setTranscriptionTarget] = useState(null); // file to attach transcription to
  const [docViewerFile, setDocViewerFile] = useState(null);
  const [transcriptionUploading, setTranscriptionUploading] = useState(false);
  const [transcriptionRemoving, setTranscriptionRemoving] = useState(false);
  const [removeTranscriptionConfirm, setRemoveTranscriptionConfirm] = useState(null);
  const [renameModal, setRenameModal] = useState(null);

  // Change-status popup state
  const [statusChangeTarget, setStatusChangeTarget] = useState(null);

  useEffect(() => {
    if (!message) return;
    if (message.type === 'success') {
      toast.success(message.text);
      return;
    }
    toast.error(message.text);
  }, [message, toast]);

  useEffect(() => {
    if (!filesError) return;
    toast.error(filesError, 'Unable to load files');
  }, [filesError, toast]);

  useEffect(() => {
    if (!transcriptionTarget) return;
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (transcriptionUploading) return;
      setTranscriptionTarget(null);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [transcriptionTarget, transcriptionUploading]);

  useEffect(() => {
    dashboardStateHydratedRef.current = false;
  }, [user?.uid]);

  useEffect(() => {
    if (typeof onScopeChange !== 'function') return;
    onScopeChange({
      selectedUserEmail,
      currentFolderId,
      rootViewMode,
    });
  }, [selectedUserEmail, currentFolderId, rootViewMode, onScopeChange]);

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.uid || dashboardStateHydratedRef.current) return;
    dashboardStateHydratedRef.current = true;

    try {
      const raw = window.localStorage.getItem(getAdminDashboardStateKey(user.uid));
      if (!raw) return;
      const state = JSON.parse(raw);
      if (!state || typeof state !== 'object') return;

      if (state.viewMode === 'grid' || state.viewMode === 'list') setViewMode(state.viewMode);
      if (typeof state.statusFilter === 'string') setStatusFilter(state.statusFilter);
      if (Array.isArray(state.serviceFilter)) setServiceFilter(state.serviceFilter);
      if (typeof state.sortBy === 'string') setSortBy(state.sortBy);
      if (typeof state.searchQuery === 'string') setSearchQuery(state.searchQuery);
      if (typeof state.currentFolderId === 'string' || state.currentFolderId === null) setCurrentFolderId(state.currentFolderId ?? null);
      if (typeof state.selectedUserEmail === 'string' || state.selectedUserEmail === null) setSelectedUserEmail(state.selectedUserEmail ?? null);
      if (Number.isInteger(state.currentPage) && state.currentPage > 0) setCurrentPage(state.currentPage);
    } catch {
      // Ignore malformed cache entries
    }
  }, [user?.uid]);

  // Reset currentFolderId if it points to a folder that no longer exists
  useEffect(() => {
    if (foldersLoading || !allFolders) return;
    if (currentFolderId && allFolders.length >= 0) {
      const exists = allFolders.some((f) => f.id === currentFolderId);
      if (!exists) { setCurrentFolderId(null); setSelectedUserEmail(null); }
    }
  }, [foldersLoading, allFolders, currentFolderId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.uid || !dashboardStateHydratedRef.current) return;
    const state = {
      viewMode,
      statusFilter,
      serviceFilter,
      sortBy,
      searchQuery,
      currentFolderId,
      selectedUserEmail,
      currentPage,
      updatedAt: Date.now(),
    };
    try {
      window.localStorage.setItem(getAdminDashboardStateKey(user.uid), JSON.stringify(state));
      window.dispatchEvent(new CustomEvent('admin-dashboard-files-state-changed', { detail: state }));
    } catch {
      // Ignore storage quota/private mode errors
    }
  }, [user?.uid, viewMode, statusFilter, serviceFilter, sortBy, searchQuery, currentFolderId, selectedUserEmail, currentPage]);

  const applyNonStatusFilters = useCallback((files, { scopedToCurrentFolder }) => {
    let result = [...files];

    const mapTypeToLabel = (t) => {
      if (!t) return '';
      if (t.startsWith('image/')) return 'Image';
      if (t.startsWith('audio/')) return 'Audio';
      if (t.startsWith('video/')) return 'Video';
      if (t === 'application/pdf') return 'PDF';
      if (t.includes('word') || t === 'application/msword') return 'Word';
      if (t.includes('excel') || t.includes('spreadsheet')) return 'Excel';
      if (t.includes('powerpoint') || t.includes('presentation')) return 'PowerPoint';
      if (t === 'text/plain' || t === 'text/csv') return 'Text';
      if (t === 'application/x-url') return 'URL';
      return 'Other';
    };

    if (scopedToCurrentFolder) {
      if (dateFrom && dateTo) {
        result = result.filter((f) => {
          if (!f.uploadedAt) return false;
          const d = new Date(f.uploadedAt);
          return d >= dateFrom && d <= dateTo;
        });
      }
      if (typeFilter) {
        result = result.filter((f) => {
          const label = mapTypeToLabel(f.type);
          if (typeFilter === 'Document') {
            return !['Image', 'Audio', 'Video'].includes(label) && label !== '';
          }
          return label === typeFilter;
        });
      }
    }

    if (serviceFilter.length > 0) {
      result = result.filter((f) => {
        if (!f.serviceCategory) return false;
        return serviceFilter.some((sf) => {
          if (sf.includes(' - ')) return f.serviceCategory === sf;
          return f.serviceCategory === sf || f.serviceCategory.startsWith(`${sf} - `);
        });
      });
    }
    if (userFilter) result = result.filter((f) => f.uploadedByEmail === userFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((f) => f.originalName && f.originalName.toLowerCase().includes(q));
    }

    return result;
  }, [dateFrom, dateTo, typeFilter, serviceFilter, userFilter, searchQuery]);

  // Effective data scoped by selected user
  const effectiveFiles = useMemo(() => {
    if (!selectedUserEmail) return allFiles;
    const selected = normalizeEmail(selectedUserEmail);
    return allFiles.filter((f) => normalizeEmail(f.uploadedByEmail) === selected);
  }, [allFiles, selectedUserEmail]);

  const effectiveFolders = useMemo(() => {
    if (!selectedUserEmail) return allFolders;
    const selected = normalizeEmail(selectedUserEmail);
    return allFolders.filter((f) => normalizeEmail(f.createdByEmail) === selected);
  }, [allFolders, selectedUserEmail]);

  // Compute counts for top status cards
  const counts = useMemo(() => {
    const insideFolder = currentFolderId !== null;
    const scopedFiles = insideFolder
      ? effectiveFiles.filter((f) => (f.folderId || null) === currentFolderId)
      : effectiveFiles;
    const filesForStatusCounts = applyNonStatusFilters(scopedFiles, { scopedToCurrentFolder: insideFolder });

    const result = { total: effectiveFiles.length, pending: 0, 'in-progress': 0, transcribed: 0 };
    for (const file of filesForStatusCounts) {
      if (result[file.status] !== undefined) result[file.status]++;
    }
    return result;
  }, [effectiveFiles, currentFolderId, applyNonStatusFilters]);

  // Static list of all service categories (always show even if no files exist)
  const serviceCategories = useMemo(() => [
    'Transcription Support - Medical',
    'Transcription Support - Legal',
    'Transcription Support - General',
    'Transcription Support - Academic',
    'Transcription Support - Corporate/Business',
    'Data Entry - Waybill/Invoice/Charge',
    'Data Entry - Batch Proof Report',
    'EMR - Data Entry & Digitalization',
    'EMR - Data Migration',
    'EMR - EMR Management',
    'Document Conversion - OCR & Data Extraction',
    'Document Conversion - File Format Conversion',
    'Document Conversion - Book and Ebook Conversion',
    'Document Conversion - Indexing & Redaction',
    'CAD - Architectural Drafting',
    'CAD - Structural Drafting',
    'CAD - MEP & HVAC',
    'CAD - 3D Visualization',
    'E-commerce Product Listing - Data Cleaning & Validation',
    'E-commerce Product Listing - Data Extraction',
  ], []);

  // Unique service categories in current folder (for folder-level filter)
  const folderServiceCategories = useMemo(() => {
    if (!currentFolderId) return [];
    const cats = new Set();
    for (const file of effectiveFiles) {
      if ((file.folderId || null) === currentFolderId && file.serviceCategory) {
        cats.add(file.serviceCategory);
      }
    }
    return Array.from(cats).sort();
  }, [effectiveFiles, currentFolderId]);

  // Unique file types in current folder (for folder-level filter)
  const folderFileTypes = useMemo(() => {
    if (!currentFolderId) return [];
    const types = new Set();
    for (const file of effectiveFiles) {
      if ((file.folderId || null) === currentFolderId && file.type) {
        // Group by main category (e.g. "image", "audio", "video", "pdf", "document")
        const t = file.type;
        if (t.startsWith('image/')) types.add('Image');
        else if (t.startsWith('audio/')) types.add('Audio');
        else if (t.startsWith('video/')) types.add('Video');
        else if (t === 'application/pdf') types.add('PDF');
        else if (t.includes('word') || t === 'application/msword') types.add('Word');
        else if (t.includes('excel') || t.includes('spreadsheet')) types.add('Excel');
        else if (t.includes('powerpoint') || t.includes('presentation')) types.add('PowerPoint');
        else if (t === 'text/plain' || t === 'text/csv') types.add('Text');
        else types.add('Other');
      }
    }
    return Array.from(types).sort();
  }, [effectiveFiles, currentFolderId]);

  // Unique user emails across all files (for user search suggestions)
  const uniqueUserEmails = useMemo(() => {
    const emails = new Set();
    for (const file of allFiles) {
      if (file.uploadedByEmail) emails.add(file.uploadedByEmail);
    }
    return Array.from(emails).sort();
  }, [allFiles]);

  // Virtual user-level folders for admin root view
  const virtualUserFolders = useMemo(() => {
    const userMap = {};
    for (const file of allFiles) {
      const rawEmail = file.uploadedByEmail || 'unknown';
      const email = normalizeEmail(rawEmail) || 'unknown';
      if (!userMap[email]) userMap[email] = { email: rawEmail, fileCount: 0, folderCount: 0, totalSize: 0, latestUpload: null };
      userMap[email].fileCount++;
      userMap[email].totalSize += file.size || 0;
      const d = file.uploadedAt ? new Date(file.uploadedAt) : null;
      if (d && (!userMap[email].latestUpload || d > userMap[email].latestUpload)) userMap[email].latestUpload = d;
    }
    for (const folder of allFolders) {
      const rawEmail = folder.createdByEmail || 'unknown';
      const email = normalizeEmail(rawEmail) || 'unknown';
      if (!userMap[email]) userMap[email] = { email: rawEmail, fileCount: 0, folderCount: 0, totalSize: 0, latestUpload: null };
      userMap[email].folderCount++;
    }
    return Object.values(userMap)
      .map((entry) => ({ ...entry, email: normalizeEmail(entry.email) || entry.email }))
      .sort((a, b) => a.email.localeCompare(b.email));
  }, [allFiles, allFolders]);

  // Global overview stats for admin root
  const globalStats = useMemo(() => {
    const stats = {
      totalUsers: virtualUserFolders.length,
      totalFiles: allFiles.length,
      totalFolders: allFolders.length,
      totalSize: 0,
      pending: 0,
      'in-progress': 0,
      transcribed: 0,
    };
    for (const f of allFiles) {
      stats.totalSize += f.size || 0;
      if (stats[f.status] !== undefined) stats[f.status]++;
    }
    return stats;
  }, [allFiles, allFolders, virtualUserFolders]);

  // Filtered & paginated virtual user folders
  const filteredUserFolders = useMemo(() => {
    if (!userSearchQuery.trim()) return virtualUserFolders;
    const q = userSearchQuery.toLowerCase().trim();
    return virtualUserFolders.filter((vu) => vu.email.toLowerCase().includes(q));
  }, [virtualUserFolders, userSearchQuery]);

  const USERS_PER_PAGE = 12;
  const totalUserPages = Math.max(1, Math.ceil(filteredUserFolders.length / USERS_PER_PAGE));
  const paginatedUserFolders = useMemo(() => {
    const start = (userPage - 1) * USERS_PER_PAGE;
    return filteredUserFolders.slice(start, start + USERS_PER_PAGE);
  }, [filteredUserFolders, userPage]);

  // Whether admin is inside a subfolder or user scope
  const isInsideFolder = currentFolderId !== null;
  const isAtVirtualRoot = rootViewMode === 'users' && !selectedUserEmail && !currentFolderId;

  // Set of valid folder IDs (for orphan detection)
  const validFolderIds = useMemo(() => new Set(effectiveFolders.map((f) => f.id)), [effectiveFolders]);

  // Files in current folder (or all user files when searching/filtering)
  const currentFolderFiles = useMemo(() => {
    if (isAtVirtualRoot) return []; // At virtual root, user folders are shown, not files
    if (isInsideFolder) {
      return effectiveFiles.filter((f) => (f.folderId || null) === currentFolderId);
    }
    // User root: expand to all user files when searching/filtering
    if (searchQuery.trim() || statusFilter || serviceFilter.length > 0) return effectiveFiles;
    // User root: show files with no folder AND orphaned files
    return effectiveFiles.filter((f) => {
      const fid = f.folderId || null;
      if (fid === null) return true;
      return !validFolderIds.has(fid);
    });
  }, [effectiveFiles, currentFolderId, searchQuery, statusFilter, serviceFilter, isInsideFolder, isAtVirtualRoot, validFolderIds]);

  // Subfolders – hidden while a status/service/type tab is active (those views are file-only)
  const currentSubfolders = useMemo(() => {
    if (isAtVirtualRoot) return []; // Virtual root shows user folders, not real folders
    if (statusFilter || serviceFilter.length > 0 || typeFilter) return [];

    let folders = effectiveFolders
      .filter((f) => (f.parentId || null) === currentFolderId);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      folders = folders.filter((f) => f.name && f.name.toLowerCase().includes(q));
    }
    // When inside a folder with date range active, filter folders by createdAt
    if (isInsideFolder && dateFrom && dateTo) {
      folders = folders.filter((f) => {
        const d = f.createdAt ? new Date(f.createdAt) : null;
        return d && d >= dateFrom && d <= dateTo;
      });
    }
    return folders;
  }, [effectiveFolders, currentFolderId, searchQuery, isInsideFolder, isAtVirtualRoot, dateFrom, dateTo, statusFilter, serviceFilter, typeFilter]);

  // Item counts per folder
  const folderItemCounts = useMemo(() => {
    const c = {};
    for (const f of effectiveFiles) {
      const fid = f.folderId || null;
      if (fid) c[fid] = (c[fid] || 0) + 1;
    }
    for (const f of effectiveFolders) {
      const pid = f.parentId || null;
      if (pid) c[pid] = (c[pid] || 0) + 1;
    }
    return c;
  }, [effectiveFiles, effectiveFolders]);

  // Total file sizes per folder (direct files only)
  const folderSizes = useMemo(() => {
    const sizes = {};
    for (const f of effectiveFiles) {
      const fid = f.folderId || null;
      if (fid && f.size > 0) {
        sizes[fid] = (sizes[fid] || 0) + f.size;
      }
    }
    return sizes;
  }, [effectiveFiles]);

  // id → name lookup for all folders (used for "inside folder" badge)
  const folderMap = useMemo(() => {
    const m = {};
    for (const f of allFolders) m[f.id] = f.name || 'Unnamed folder';
    return m;
  }, [allFolders]);

  // Helper: match file type to grouped label
  const getFileTypeLabel = useCallback((t) => {
    if (!t) return '';
    if (t.startsWith('image/')) return 'Image';
    if (t.startsWith('audio/')) return 'Audio';
    if (t.startsWith('video/')) return 'Video';
    if (t === 'application/pdf') return 'PDF';
    if (t.includes('word') || t === 'application/msword') return 'Word';
    if (t.includes('excel') || t.includes('spreadsheet')) return 'Excel';
    if (t.includes('powerpoint') || t.includes('presentation')) return 'PowerPoint';
    if (t === 'text/plain' || t === 'text/csv') return 'Text';
    return 'Other';
  }, []);

  // Filter + sort
  const filteredFiles = useMemo(() => {
    let result = applyNonStatusFilters(currentFolderFiles, { scopedToCurrentFolder: isInsideFolder });

    if (statusFilter) result = result.filter((f) => f.status === statusFilter);

    switch (sortBy) {
      case 'oldest': result.sort((a, b) => new Date(a.uploadedAt || 0) - new Date(b.uploadedAt || 0)); break;
      case 'name-asc': result.sort((a, b) => (a.originalName || '').localeCompare(b.originalName || '')); break;
      case 'name-desc': result.sort((a, b) => (b.originalName || '').localeCompare(a.originalName || '')); break;
      case 'size': result.sort((a, b) => (b.size || 0) - (a.size || 0)); break;
      default: result.sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0)); break;
    }
    return result;
  }, [currentFolderFiles, statusFilter, sortBy, isInsideFolder, applyNonStatusFilters]);

  // Combined items for pagination: sort folders by the same sortBy, then combine with files
  const allPageItems = useMemo(() => {
    const sortedFolders = [...currentSubfolders];
    switch (sortBy) {
      case 'oldest': sortedFolders.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)); break;
      case 'name-asc': sortedFolders.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break;
      case 'name-desc': sortedFolders.sort((a, b) => (b.name || '').localeCompare(a.name || '')); break;
      case 'size': {
        const foldersWithSize = sortedFolders.map((f) => ({ ...f, _isFolder: true, _size: folderSizes[f.id] || 0 }));
        const filesWithSize = filteredFiles.map((f) => ({ ...f, _isFolder: false, _size: f.size || 0 }));
        return [...foldersWithSize, ...filesWithSize].sort((a, b) => b._size - a._size);
      }
      default: sortedFolders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)); break;
    }
    return [...sortedFolders, ...filteredFiles];
  }, [currentSubfolders, filteredFiles, sortBy, folderSizes]);
  const totalFilePages = Math.max(1, Math.ceil(allPageItems.length / ADMIN_DASHBOARD_PAGE_SIZE));
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * ADMIN_DASHBOARD_PAGE_SIZE;
    return allPageItems.slice(startIndex, startIndex + ADMIN_DASHBOARD_PAGE_SIZE);
  }, [allPageItems, currentPage]);
  const folderIdSet = useMemo(() => new Set(currentSubfolders.map((f) => f.id)), [currentSubfolders]);
  const paginatedFolders = useMemo(() => paginatedItems.filter((item) => folderIdSet.has(item.id)), [paginatedItems, folderIdSet]);
  const paginatedFiles = useMemo(() => paginatedItems.filter((item) => !folderIdSet.has(item.id)), [paginatedItems, folderIdSet]);

  useEffect(() => {
    setCurrentPage((prev) => {
      if (prev < 1) return 1;
      if (prev > totalFilePages) return totalFilePages;
      return prev;
    });
  }, [totalFilePages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, serviceFilter, searchQuery, sortBy, currentFolderId, selectedUserEmail, rootViewMode, dateFrom, dateTo, typeFilter]);

  // Reset user page when search changes
  useEffect(() => {
    setUserPage(1);
  }, [userSearchQuery]);

  // Clamp user page to valid range
  useEffect(() => {
    setUserPage((prev) => {
      if (prev < 1) return 1;
      if (prev > totalUserPages) return totalUserPages;
      return prev;
    });
  }, [totalUserPages]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter, serviceFilter, searchQuery, sortBy, currentFolderId, selectedUserEmail, rootViewMode, dateFrom, dateTo, typeFilter]);

  // Reset filters when switching between root and folder views
  useEffect(() => {
    if (!currentFolderId) {
      // Going to root: clear folder-level filters
      setDateFrom(null);
      setDateTo(null);
      setTypeFilter('');
    } else {
      // Entering a folder: clear root-level filters
      setStatusFilter('');
    }
  }, [currentFolderId]);

  // Selection helpers
  const filteredIds = useMemo(() => new Set(filteredFiles.map((f) => f.id)), [filteredFiles]);
  const folderIds = useMemo(() => new Set(allFolders.map((f) => f.id)), [allFolders]);
  const pageFileIds = useMemo(() => new Set(paginatedFiles.map((f) => f.id)), [paginatedFiles]);
  const pageFolderIds = useMemo(() => new Set(paginatedFolders.map((f) => f.id)), [paginatedFolders]);
  const allPageIds = useMemo(() => new Set([...pageFileIds, ...pageFolderIds]), [pageFileIds, pageFolderIds]);
  const allSelected = allPageIds.size > 0 && [...allPageIds].every((id) => selectedIds.has(id));
  const someSelected = [...allPageIds].some((id) => selectedIds.has(id));
  const selectedFileIds = useMemo(() => [...selectedIds].filter((id) => filteredIds.has(id)), [selectedIds, filteredIds]);
  const selectedFolderIds = useMemo(() => [...selectedIds].filter((id) => folderIds.has(id)), [selectedIds, folderIds]);
  const selectedFileCount = selectedFileIds.length;
  const selectedFolderCount = selectedFolderIds.length;

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of allPageIds) next.delete(id);
      } else {
        for (const id of allPageIds) next.add(id);
      }
      return next;
    });
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Ordered list of visible page items for range selection (folders first, then files)
  const orderedPageItems = useMemo(
    () => [...paginatedFolders.map((f) => f.id), ...paginatedFiles.map((f) => f.id)],
    [paginatedFolders, paginatedFiles],
  );

  // Smart select: handles Shift+click (range), Ctrl/Cmd+click (toggle), plain toggle
  const handleSelectClick = useCallback(
    (id, e) => {
      if (e?.shiftKey && lastAnchorId.current != null) {
        const start = orderedPageItems.indexOf(lastAnchorId.current);
        const end = orderedPageItems.indexOf(id);
        if (start !== -1 && end !== -1) {
          const [from, to] = start <= end ? [start, end] : [end, start];
          const rangeIds = orderedPageItems.slice(from, to + 1);
          setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const rid of rangeIds) next.add(rid);
            return next;
          });
        }
        return;
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      lastAnchorId.current = id;
    },
    [orderedPageItems],
  );

  const handleStatusChange = useCallback(async (fileId, newStatus) => {
    setStatusLoading(fileId);
    setMessage(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/files/metadata/${fileId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update status.');
      setMessage({ type: 'success', text: 'Status updated.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setStatusLoading(null);
      setTimeout(() => setMessage(null), 3000);
    }
  }, [getIdToken]);

  // Attach transcription to a file
  const handleAttachTranscription = useCallback(async (fileId, file) => {
    setTranscriptionUploading(true);
    setMessage(null);
    try {
      const token = await getIdToken();
      const formData = new FormData();
      formData.append('transcription', file);
      const res = await fetch(`/api/files/metadata/${fileId}/transcription`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to attach transcription.');
      setMessage({ type: 'success', text: `Transcription "${data.transcriptionName}" attached successfully.` });
      setTranscriptionTarget(null);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setTranscriptionUploading(false);
      setTimeout(() => setMessage(null), 4000);
    }
  }, [getIdToken]);

  // Remove transcription from a file
  const handleRemoveTranscription = useCallback(async (fileId) => {
    setMessage(null);
    setTranscriptionRemoving(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/files/metadata/${fileId}/transcription`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to remove transcription.');
      setMessage({ type: 'success', text: 'Transcription removed.' });
      setTranscriptionTarget(null);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setTranscriptionRemoving(false);
      setRemoveTranscriptionConfirm(null);
      setTimeout(() => setMessage(null), 3000);
    }
  }, [getIdToken]);

  const handleUpdateDescription = useCallback(async (fileId, description) => {
    const token = await getIdToken();
    const res = await fetch(`/api/files/metadata/${fileId}/description`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ description }),
    });
    const raw = await res.text();
    let data = {};
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = { error: raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() };
      }
    }
    if (!res.ok || !data.success) {
      throw new Error(data.error || `Failed to update note (${res.status}).`);
    }
    setPreviewFile((prev) => (prev && prev.id === fileId ? { ...prev, description: data.description ?? description } : prev));
  }, [getIdToken]);

  const handleDeleteFile = useCallback(async (fileId) => {
    setDeleteLoading(fileId);
    setMessage(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/files/metadata/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete file.');
      setMessage({ type: 'success', text: 'File deleted.' });
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(fileId); return next; });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setDeleteLoading(null);
      setDeleteConfirm(null);
      setTimeout(() => setMessage(null), 3000);
    }
  }, [getIdToken]);

  const handleBulkDownload = useCallback(async () => {
    if (selectedFileIds.length === 0) return;
    setBulkLoading(true);
    setMessage(null);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/files/bulk-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fileIds: selectedFileIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Download failed.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `digiscribe-files-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: `Downloaded ${selectedFileIds.length} file(s).` });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBulkLoading(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }, [selectedFileIds, getIdToken]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedFileIds.length === 0 && selectedFolderIds.length === 0) return;
    setBulkLoading(true);
    setMessage(null);
    try {
      const token = await getIdToken();

      // Build selected folder subtree ids (selected folder + all descendants).
      const folderMap = new Map(allFolders.map((folder) => [folder.id, folder]));
      const childrenByParent = new Map();
      for (const folder of allFolders) {
        const parentId = folder.parentId || null;
        if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
        childrenByParent.get(parentId).push(folder.id);
      }

      const folderIdsToDelete = new Set();
      for (const rootId of selectedFolderIds) {
        if (!folderMap.has(rootId)) continue;
        const stack = [rootId];
        while (stack.length > 0) {
          const currentId = stack.pop();
          if (folderIdsToDelete.has(currentId)) continue;
          folderIdsToDelete.add(currentId);
          const children = childrenByParent.get(currentId) || [];
          for (const childId of children) stack.push(childId);
        }
      }

      // Delete selected files + files inside selected folder subtrees.
      const fileIdsToDelete = new Set(selectedFileIds);
      for (const file of allFiles) {
        const folderId = file.folderId || null;
        if (folderId && folderIdsToDelete.has(folderId)) {
          fileIdsToDelete.add(file.id);
        }
      }

      let deletedFiles = 0;
      const fileIdList = [...fileIdsToDelete];
      for (let index = 0; index < fileIdList.length; index += 100) {
        const batch = fileIdList.slice(index, index + 100);
        if (batch.length === 0) continue;
        const res = await fetch('/api/files/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ fileIds: batch }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Bulk delete failed.');
        deletedFiles += Number(data.deleted || 0);
      }

      // Delete folders deepest-first so parents don't reparent descendants.
      const depthCache = new Map();
      const getDepth = (folderId) => {
        if (depthCache.has(folderId)) return depthCache.get(folderId);
        const folder = folderMap.get(folderId);
        if (!folder || !folder.parentId || !folderMap.has(folder.parentId)) {
          depthCache.set(folderId, 0);
          return 0;
        }
        const depth = 1 + getDepth(folder.parentId);
        depthCache.set(folderId, depth);
        return depth;
      };

      const orderedFolders = [...folderIdsToDelete].sort((a, b) => getDepth(b) - getDepth(a));
      let deletedFolders = 0;
      let skippedFolders = 0;
      for (const folderId of orderedFolders) {
        try {
          const res = await fetch(`/api/folders/${folderId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) {
            skippedFolders++;
            continue;
          }
          deletedFolders++;
        } catch {
          skippedFolders++;
        }
      }

      const parts = [];
      if (deletedFiles > 0) parts.push(`${deletedFiles} file${deletedFiles !== 1 ? 's' : ''}`);
      if (deletedFolders > 0) parts.push(`${deletedFolders} folder${deletedFolders !== 1 ? 's' : ''}`);
      if (skippedFolders > 0) parts.push(`${skippedFolders} skipped`);
      setMessage({ type: 'success', text: `Deleted ${parts.join(', ')}.` });
      setSelectedIds(new Set());
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBulkLoading(false);
      setBulkDeleteConfirm(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }, [selectedFileIds, selectedFolderIds, getIdToken, allFiles, allFolders]);

  const copyFileUrl = useCallback((file) => {
    const url = fileUrl(file.url);
    navigator.clipboard.writeText(url).then(
      () => { setMessage({ type: 'success', text: 'URL copied to clipboard.' }); setTimeout(() => setMessage(null), 2000); },
      () => { setMessage({ type: 'error', text: 'Failed to copy URL.' }); }
    );
  }, []);

  // Folder action handlers
  const handleCreateFolder = useCallback(async (name, parentId) => {
    console.log('[admin/create-folder-click]', {
      selectedUserEmail: selectedUserEmail || '',
      parentId: parentId || null,
      folderName: name,
    });
    await createFolder(name, parentId, selectedUserEmail || null);
    await refetchFolders();
    setMessage({ type: 'success', text: `Folder "${name}" created.` });
    setTimeout(() => setMessage(null), 3000);
  }, [createFolder, refetchFolders, selectedUserEmail]);

  const handleRenameFolder = useCallback(async (folderId, newName) => {
    try {
      await renameFolder(folderId, newName);
      await refetchFolders();
      setMessage({ type: 'success', text: 'Folder renamed.' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
    setRenamingFolder(null);
  }, [renameFolder, refetchFolders]);

  const handleRenameFile = useCallback(async (fileId, newName) => {
    if (!newName.trim()) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/files/metadata/${fileId}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Rename failed.');
      setMessage({ type: 'success', text: 'File renamed.' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
    setRenamingFileId(null);
  }, [getIdToken]);

  const handleDeleteFolder = useCallback(async (folderId) => {
    try {
      await deleteFolder(folderId);
      await refetchFolders();
      setMessage({ type: 'success', text: 'Folder and its contents deleted.' });
      setTimeout(() => setMessage(null), 3000);
      if (currentFolderId === folderId) {
        const folder = allFolders.find((f) => f.id === folderId);
        setCurrentFolderId(folder?.parentId || null);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
    setDeleteFolderConfirm(null);
  }, [deleteFolder, refetchFolders, currentFolderId, allFolders]);

  // Track whether any drag is in progress (used to light up breadcrumb drop zone)
  useEffect(() => {
    const onStart = () => setIsDraggingAny(true);
    const onEnd = () => setIsDraggingAny(false);
    document.addEventListener('dragstart', onStart);
    document.addEventListener('dragend', onEnd);
    document.addEventListener('drop', onEnd);
    return () => {
      document.removeEventListener('dragstart', onStart);
      document.removeEventListener('dragend', onEnd);
      document.removeEventListener('drop', onEnd);
    };
  }, []);

  // Drag-start handler — supports multi-select dragging
  const handleDragStart = useCallback((e, item, itemType) => {
    const isItemSelected = selectedIds.has(item.id);
    const isMulti = isItemSelected && selectedIds.size > 1;
    if (isMulti) {
      e.dataTransfer.setData('application/json', JSON.stringify({
        type: 'multi',
        fileIds: selectedFileIds,
        folderIds: selectedFolderIds,
      }));
      // Show a count badge as the drag ghost
      const ghost = document.createElement('div');
      ghost.style.cssText = 'position:fixed;top:-9999px;left:-9999px;background:#4f46e5;color:#fff;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:600;white-space:nowrap;';
      ghost.textContent = `${selectedIds.size} items`;
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 18);
      setTimeout(() => document.body.removeChild(ghost), 0);
    } else {
      e.dataTransfer.setData('application/json', JSON.stringify({ type: itemType, id: item.id }));
    }
    e.dataTransfer.effectAllowed = 'move';
  }, [selectedIds, selectedFileIds, selectedFolderIds]);

  // Drag and drop handler — handles single and multi-select drops
  const handleDrop = useCallback(async (e, targetFolderId) => {
    setDragOverFolder(null);
    let isMultiDrop = false;
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (payload.type === 'multi') {
        isMultiDrop = true;
        setBulkLoading(true);
        let movedFiles = 0, movedFolders = 0, skippedFolders = 0;
        const { fileIds, folderIds } = payload;
        if (fileIds.length > 0) {
          const token = await getIdToken();
          const res = await fetch('/api/files/bulk-move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ fileIds, folderId: targetFolderId || null }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.error || 'Move failed.');
          movedFiles = Number(data.moved || 0);
        }
        for (const fid of folderIds) {
          if (fid === targetFolderId) { skippedFolders++; continue; }
          try { await moveFolder(fid, targetFolderId || null); movedFolders++; }
          catch { skippedFolders++; }
        }
        const parts = [];
        if (movedFiles > 0) parts.push(`${movedFiles} file${movedFiles !== 1 ? 's' : ''}`);
        if (movedFolders > 0) parts.push(`${movedFolders} folder${movedFolders !== 1 ? 's' : ''}`);
        if (skippedFolders > 0) parts.push(`${skippedFolders} skipped`);
        setMessage({ type: 'success', text: `Moved ${parts.join(', ')}.` });
        setSelectedIds(new Set());
      } else if (payload.type === 'file') {
        await moveFileToFolder(payload.id, targetFolderId);
        setMessage({ type: 'success', text: 'File moved.' });
      } else if (payload.type === 'folder') {
        if (payload.id === targetFolderId) return;
        await moveFolder(payload.id, targetFolderId);
        setMessage({ type: 'success', text: 'Folder moved.' });
      }
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      if (isMultiDrop) setBulkLoading(false);
    }
  }, [moveFileToFolder, moveFolder, getIdToken]);

  const handleMoveConfirm = useCallback(async (targetFolderId) => {
    if (!moveTarget) return;
    try {
      if (moveTarget.type === 'file') {
        await moveFileToFolder(moveTarget.item.id, targetFolderId);
        setMessage({ type: 'success', text: 'File moved.' });
      } else {
        await moveFolder(moveTarget.item.id, targetFolderId);
        setMessage({ type: 'success', text: 'Folder moved.' });
      }
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
    setMoveTarget(null);
  }, [moveTarget, moveFileToFolder, moveFolder]);

  const getDescendantIds = useCallback((folderId) => {
    const ids = new Set([folderId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of allFolders) {
        if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
          ids.add(f.id);
          changed = true;
        }
      }
    }
    return [...ids];
  }, [allFolders]);

  // Bulk move to folder
  const handleBulkMove = useCallback(async (targetFolderId) => {
    if (selectedFileIds.length === 0 && selectedFolderIds.length === 0) return;
    setBulkLoading(true);
    setMessage(null);
    try {
      let movedFiles = 0;
      let movedFolders = 0;
      let skippedFolders = 0;

      if (selectedFileIds.length > 0) {
        const token = await getIdToken();
        const res = await fetch('/api/files/bulk-move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ fileIds: selectedFileIds, folderId: targetFolderId || null }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Move failed.');
        movedFiles = Number(data.moved || 0);
      }

      for (const folderId of selectedFolderIds) {
        if (folderId === targetFolderId) {
          skippedFolders++;
          continue;
        }
        if (targetFolderId && getDescendantIds(folderId).includes(targetFolderId)) {
          skippedFolders++;
          continue;
        }
        try {
          await moveFolder(folderId, targetFolderId || null);
          movedFolders++;
        } catch {
          skippedFolders++;
        }
      }

      const parts = [];
      if (movedFiles > 0) parts.push(`${movedFiles} file${movedFiles !== 1 ? 's' : ''}`);
      if (movedFolders > 0) parts.push(`${movedFolders} folder${movedFolders !== 1 ? 's' : ''}`);
      if (skippedFolders > 0) parts.push(`${skippedFolders} skipped`);
      setMessage({ type: 'success', text: `Moved ${parts.join(', ')}.` });
      setSelectedIds(new Set());
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBulkLoading(false);
      setBulkMoveActive(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }, [selectedFileIds, selectedFolderIds, getIdToken, getDescendantIds, moveFolder]);

  // Bulk status change
  const handleBulkStatus = useCallback(async (newStatus) => {
    if (selectedFileIds.length === 0) return;
    setBulkLoading(true);
    setMessage(null);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/files/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fileIds: selectedFileIds, status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Status change failed.');
      setMessage({ type: 'success', text: `Updated ${data.updated} file(s) to "${newStatus}".` });
      setSelectedIds(new Set());
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBulkLoading(false);
      setBulkStatusTarget(null);
      setTimeout(() => setMessage(null), 3000);
    }
  }, [selectedFileIds, getIdToken]);

  const handleDeleteAllDev = useCallback(async () => {
    if (!import.meta.env.DEV) return;
    if (bulkLoading) return;

    const totalFiles = allFiles.length;
    const totalFolders = allFolders.length;

    if (totalFiles === 0 && totalFolders === 0) {
      setMessage({ type: 'success', text: 'Nothing to delete.' });
      setTimeout(() => setMessage(null), 2500);
      return;
    }

    setBulkLoading(true);
    setMessage(null);
    try {
      const token = await getIdToken();
      const fileIds = allFiles.map((f) => f.id).filter(Boolean);

      let deletedFiles = 0;
      for (let index = 0; index < fileIds.length; index += 100) {
        const chunk = fileIds.slice(index, index + 100);
        if (chunk.length === 0) continue;

        const res = await fetch('/api/files/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ fileIds: chunk }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed while deleting files.');
        deletedFiles += Number(data.deleted || 0);
      }

      const folderMap = new Map(allFolders.map((folder) => [folder.id, folder]));
      const depthCache = new Map();
      const getDepth = (folderId) => {
        if (depthCache.has(folderId)) return depthCache.get(folderId);
        const folder = folderMap.get(folderId);
        if (!folder || !folder.parentId || !folderMap.has(folder.parentId)) {
          depthCache.set(folderId, 0);
          return 0;
        }
        const depth = 1 + getDepth(folder.parentId);
        depthCache.set(folderId, depth);
        return depth;
      };

      const foldersByDepthDesc = [...allFolders]
        .map((folder) => ({ id: folder.id, depth: getDepth(folder.id) }))
        .sort((a, b) => b.depth - a.depth)
        .map((folder) => folder.id);

      let deletedFolders = 0;
      let skippedFolders = 0;
      for (const folderId of foldersByDepthDesc) {
        const res = await fetch(`/api/folders/${folderId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          skippedFolders += 1;
          continue;
        }
        deletedFolders += 1;
      }

      setSelectedIds(new Set());
      const skippedText = skippedFolders > 0 ? `, ${skippedFolders} folder(s) skipped` : '';
      setMessage({ type: 'success', text: `DEV reset done: ${deletedFiles} file(s), ${deletedFolders} folder(s) deleted${skippedText}.` });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete all data.' });
    } finally {
      setDeleteAllDevConfirm(false);
      setBulkLoading(false);
      setTimeout(() => setMessage(null), 3500);
    }
  }, [allFiles, allFolders, bulkLoading, getIdToken]);

  // Folder download as ZIP
  const handleFolderDownload = useCallback(async (folder) => {
    setMessage(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/files/download-folder/${folder.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Download failed.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folder.name || 'folder'}-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: `Downloading folder "${folder.name}" as ZIP.` });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setTimeout(() => setMessage(null), 3000);
    }
  }, [getIdToken]);

  const triggerDirectDownload = useCallback((rawUrl, fileName, key) => {
    const resolved = fileDownloadUrl(rawUrl);
    if (!resolved) return;

    const loadingKey = key || `download-${Date.now()}`;
    setDownloadLoadingKey(loadingKey);
    try {
      const a = document.createElement('a');
      a.href = resolved;
      if (fileName) a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => {
        setDownloadLoadingKey((prev) => (prev === loadingKey ? '' : prev));
      }, 1200);
    }
  }, []);

  const openTranscriptionPreview = useCallback((transcription) => {
    if (!transcription?.transcriptionUrl) return;
    setPreviewFile({
      id: transcription.id,
      originalName: transcription.transcriptionName || 'Transcription',
      url: transcription.transcriptionUrl,
      type: transcription.transcriptionType,
      size: transcription.transcriptionSize,
      description: transcription.description || transcription.note || transcription.fileDescription || '',
      note: transcription.note || '',
      fileDescription: transcription.fileDescription || '',
      sourceType: 'file',
    });
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('admin-dashboard-view-mode', viewMode);
    }
  }, [viewMode]);

  // Context menu handlers
  const handleFileContextMenu = useCallback((e, file) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, file, type: 'file' });
  }, []);

  const handleFolderContextMenu = useCallback((e, folder) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, folder, type: 'folder' });
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const closeContextMenu = () => setContextMenu(null);

    window.addEventListener('scroll', closeContextMenu, true);
    window.addEventListener('wheel', closeContextMenu, true);
    window.addEventListener('touchmove', closeContextMenu, true);

    return () => {
      window.removeEventListener('scroll', closeContextMenu, true);
      window.removeEventListener('wheel', closeContextMenu, true);
      window.removeEventListener('touchmove', closeContextMenu, true);
    };
  }, [contextMenu]);

  const contextMenuItems = useMemo(() => {
    if (!contextMenu) return [];

    if (contextMenu.type === 'folder') {
      const folder = contextMenu.folder;
      return [
        { icon: 'fa-check-square', label: selectedIds.has(folder.id) ? 'Deselect' : 'Select', onClick: () => toggleSelect(folder.id) },
        { divider: true },
        { icon: 'fa-folder-open', label: 'Open', onClick: () => setCurrentFolderId(folder.id) },
        { icon: 'fa-pencil-alt', label: 'Rename', onClick: () => setRenameModal({ type: 'folder', id: folder.id, value: folder.name || '' }) },
        { icon: 'fa-arrows-alt', label: 'Move to...', onClick: () => setMoveTarget({ type: 'folder', item: folder }) },
        { icon: 'fa-file-archive', label: 'Download as ZIP', onClick: () => handleFolderDownload(folder) },
        { icon: 'fa-info-circle', label: 'Properties', onClick: () => setPropertiesFolder(folder) },
        { divider: true },
        { icon: 'fa-trash-alt', label: 'Delete Folder', danger: true, onClick: () => setDeleteFolderConfirm(folder.id) },
      ];
    }

    if (contextMenu.type === 'transcription') {
      const file = contextMenu.file;
      return [
        { icon: 'fa-eye', label: 'View Transcription', onClick: () => openTranscriptionPreview(file) },
        { icon: 'fa-download', label: 'Download Transcription', onClick: () => triggerDirectDownload(file.transcriptionUrl, file.transcriptionName || 'Transcription', `trans-${file.id}`) },
        { divider: true },
        { icon: 'fa-link', label: 'Copy Link', onClick: () => { navigator.clipboard.writeText(window.location.origin + fileUrl(file.transcriptionUrl)).catch(() => {}); } },
        { divider: true },
        { icon: 'fa-trash-alt', label: 'Remove Transcription', danger: true, onClick: () => { setRemoveTranscriptionConfirm({ id: file.id, name: file.transcriptionName || 'Transcription' }); setContextMenu(null); } },
      ];
    }

    const file = contextMenu.file;
    const isUrl = file.sourceType === 'url';
    const sourceHref = file.sourceUrl || file.sourceReferenceUrl || (isUrl ? file.url : '');
    const items = [];

    const selCount = [...selectedIds].filter((id) => filteredIds.has(id)).length;

    if (selCount <= 1) {
      items.push({ icon: 'fa-check-square', label: selectedIds.has(file.id) ? 'Deselect' : 'Select', onClick: () => toggleSelect(file.id) });
      items.push({ divider: true });
      items.push({ icon: 'fa-eye', label: 'Preview', onClick: () => setPreviewFile(file) });
      items.push({ icon: 'fa-sticky-note', label: 'Add/View Note', onClick: () => setPreviewFile(file) });
      if (isUrl && sourceHref) {
        items.push({
          icon: 'fa-up-right-from-square',
          label: 'Open Source Link',
          onClick: () => window.open(sourceHref, '_blank', 'noopener,noreferrer'),
        });
      }
      items.push({ icon: 'fa-pencil-alt', label: 'Rename', onClick: () => {
        const name = file.originalName || '';
        const ext = name.includes('.') ? '.' + name.split('.').pop() : '';
        const base = ext ? name.slice(0, -ext.length) : name;
        setRenameModal({ type: 'file', id: file.id, value: base, suffix: ext });
      } });
      items.push({ icon: 'fa-download', label: 'Download', disabled: isUrl, onClick: isUrl ? () => {} : () => triggerDirectDownload(file.url, file.originalName || 'download', `file-${file.id}`) });
      items.push({ divider: true });
      items.push({ icon: 'fa-folder-open', label: 'Move to Folder...', onClick: () => setMoveTarget({ type: 'file', item: file }) });
      items.push({
        icon: file.transcriptionUrl ? 'fa-file-circle-check' : 'fa-paperclip',
        label: file.transcriptionUrl ? 'Manage Transcription' : 'Attach Transcription',
        onClick: () => setTranscriptionTarget(file),
      });
      items.push({ icon: 'fa-sliders-h', label: 'Change Status', onClick: () => { setStatusChangeTarget(file); setContextMenu(null); } });
      items.push({ divider: true });
      items.push({ icon: 'fa-info-circle', label: 'Properties', onClick: () => setPropertiesFile(file) });
      items.push({ icon: 'fa-trash-alt', label: 'Delete', danger: true, onClick: () => { setDeleteConfirm(file.id); } });
    }

    if (selCount > 1) {
      items.push({ icon: 'fa-check-square', label: selectedIds.has(file.id) ? 'Deselect' : 'Select', onClick: () => toggleSelect(file.id) });
      items.push({ divider: true });
      items.push({ icon: 'fa-download', label: `Download ${selCount} Selected as ZIP`, onClick: () => handleBulkDownload() });
      items.push({ divider: true });
      items.push({ icon: 'fa-sliders-h', label: `Change Status of ${selCount} Selected`, onClick: () => { setStatusChangeTarget({ bulkMode: true, count: selCount }); setContextMenu(null); } });
      items.push({ icon: 'fa-arrows-alt', label: 'Move Selected', onClick: () => setBulkMoveActive(true) });
      items.push({ icon: 'fa-times-circle', label: 'Deselect All', onClick: () => setSelectedIds(new Set()) });
      items.push({ icon: 'fa-trash-alt', label: 'Delete Selected', danger: true, onClick: () => setBulkDeleteConfirm(true) });
    }

    return items;
  }, [contextMenu, selectedIds, filteredIds, handleBulkDownload, handleFolderDownload, triggerDirectDownload, openTranscriptionPreview]);

  const clearFilters = () => {
    setStatusFilter('');
    setServiceFilter([]);
    setSearchQuery('');
    setDateFrom(null);
    setDateTo(null);
    setTypeFilter('');
    setUserFilter('');
  };

  const hasActiveFilters = statusFilter || serviceFilter.length > 0 || searchQuery || userFilter || (isInsideFolder && (dateFrom || dateTo || typeFilter));

  const uploadLink = useMemo(() => {
    const params = new URLSearchParams();
    if (currentFolderId) params.set('folderId', currentFolderId);
    if (selectedUserEmail) params.set('targetOwnerEmail', selectedUserEmail);
    const query = params.toString();
    return query ? `/upload?${query}` : '/upload';
  }, [currentFolderId, selectedUserEmail]);

  const createFolderButtonLabel = selectedUserEmail ? 'Create Folder to this User' : 'New Folder';
  const uploadButtonLabel = selectedUserEmail ? 'Upload File to this User' : 'Upload Files';

  // Folder-level date change handler
  const handleDateRangeChange = useCallback((from, to) => {
    setDateFrom(from);
    setDateTo(to);
  }, []);
  const isSearching = searchQuery.trim().length > 0;
  const selectedCount = selectedFileCount + selectedFolderCount;
  const totalItems = isAtVirtualRoot ? virtualUserFolders.length : currentSubfolders.length + filteredFiles.length;

  // Keyboard shortcuts (Ctrl+A, Escape, Delete, Ctrl+I)
  useEffect(() => {
    const handler = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 'a') {
        e.preventDefault();
        window.getSelection()?.removeAllRanges();
        if (allPageIds.size > 0) {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            const isAllSelected = [...allPageIds].every((id) => next.has(id));
            if (isAllSelected) {
              for (const id of allPageIds) next.delete(id);
            } else {
              for (const id of allPageIds) next.add(id);
            }
            return next;
          });
        }
        return;
      }

      if (ctrl && e.key === 'i') {
        e.preventDefault();
        if (allPageIds.size > 0) {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const id of allPageIds) {
              if (next.has(id)) next.delete(id);
              else next.add(id);
            }
            return next;
          });
        }
        return;
      }

      if (e.key === 'Escape') {
        setSelectedIds(new Set());
        lastAnchorId.current = null;
        return;
      }

      if (e.key === 'Delete' && selectedCount > 0) {
        e.preventDefault();
        setBulkDeleteConfirm(true);
        return;
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [allPageIds, selectedCount]);
  const isLoading = filesLoading || foldersLoading;

  return (
    <div className="space-y-4">
      {/* Stats Row — hidden at virtual root */}
      {!isAtVirtualRoot && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          onClick={() => setStatusFilter('')}
          className={`bg-white rounded-xl border p-4 text-left transition-all hover:shadow-md ${
            !statusFilter ? 'border-primary/30 shadow-sm ring-1 ring-primary/10' : 'border-gray-100'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-text uppercase tracking-wide">Total</p>
              <p className="text-2xl font-bold text-dark-text mt-1">{counts.total}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <i className="fas fa-layer-group text-primary"></i>
            </div>
          </div>
        </button>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setStatusFilter((prev) => (prev === key ? '' : key))}
            className={`bg-white rounded-xl border p-4 text-left transition-all hover:shadow-md ${
              statusFilter === key ? `${cfg.border} shadow-sm ring-1 ${cfg.ring}/20` : 'border-gray-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-text uppercase tracking-wide">{cfg.label}</p>
                <p className={`text-2xl font-bold mt-1 ${cfg.text}`}>{counts[key]}</p>
              </div>
              <div className={`w-10 h-10 rounded-lg ${cfg.iconBg} flex items-center justify-center`}>
                <i className={`fas ${cfg.icon} ${cfg.text}`}></i>
              </div>
            </div>
          </button>
        ))}
      </div>
      )}

      {/* Filter Bar – conditionally render based on root vs inside folder (hidden at virtual root) */}
      {!isAtVirtualRoot && (isInsideFolder ? (
        /* ── Inside-folder filter: date range + type + category ── */
        <div className="space-y-3">
          <FolderFilterToolbar
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateChange={handleDateRangeChange}
            typeFilter={typeFilter}
            onTypeChange={setTypeFilter}
            serviceFilter={serviceFilter}
            onServiceChange={setServiceFilter}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            fileTypes={folderFileTypes}
            serviceCategories={folderServiceCategories}
            sortBy={sortBy}
            onSortChange={setSortBy}
            onClear={clearFilters}
            hasActiveFilters={hasActiveFilters}
            userFilter={userFilter}
            onUserChange={setUserFilter}
            userEmails={uniqueUserEmails}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                  viewMode === 'grid' ? 'bg-white text-primary shadow-sm' : 'text-gray-text hover:text-dark-text'
                }`}
              >
                <i className="fas fa-th-large text-[10px]"></i>
                Grid
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                  viewMode === 'list' ? 'bg-white text-primary shadow-sm' : 'text-gray-text hover:text-dark-text'
                }`}
              >
                <i className="fas fa-list text-[10px]"></i>
                List
              </button>
            </div>
            <button
              onClick={() => setShowCreateFolder(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors whitespace-nowrap border border-indigo-200"
            >
              <i className="fas fa-folder-plus text-xs"></i>
              {createFolderButtonLabel}
            </button>
            {hasActiveFilters && (
              <span className="text-xs text-gray-400 ml-auto">
                {filteredFiles.length} result{filteredFiles.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      ) : (
        /* ── Root (My Files) filter: original A-Z / status / service bar ── */
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 text-sm"></i>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by file name..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-dark-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <i className="fas fa-times text-xs"></i>
                </button>
              )}
            </div>

            <ServicePicker value={serviceFilter} onChange={setServiceFilter} />

            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none pl-4 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-dark-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all min-w-[150px]"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <i className="fas fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none"></i>
            </div>

            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 self-start">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                  viewMode === 'grid' ? 'bg-white text-primary shadow-sm' : 'text-gray-text hover:text-dark-text'
                }`}
              >
                <i className="fas fa-th-large text-[10px]"></i>
                Grid
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                  viewMode === 'list' ? 'bg-white text-primary shadow-sm' : 'text-gray-text hover:text-dark-text'
                }`}
              >
                <i className="fas fa-list text-[10px]"></i>
                List
              </button>
            </div>

            <button
              onClick={() => setShowCreateFolder(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors whitespace-nowrap border border-indigo-200"
            >
              <i className="fas fa-folder-plus text-xs"></i>
              {createFolderButtonLabel}
            </button>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-gray-text hover:text-dark-text hover:bg-gray-50 rounded-lg transition-colors whitespace-nowrap"
              >
                <i className="fas fa-times text-xs"></i>
                Clear
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">Showing:</span>
              {statusFilter && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${STATUS_CONFIG[statusFilter].bg} ${STATUS_CONFIG[statusFilter].text}`}>
                  {STATUS_CONFIG[statusFilter].label}
                  <button onClick={() => setStatusFilter('')} className="hover:opacity-70"><i className="fas fa-times text-[8px]"></i></button>
                </span>
              )}
              {serviceFilter.length > 0 && serviceFilter.map((sf) => {
                const parentLabel = sf.includes(' - ') ? sf.split(' - ')[0] : sf;
                const subLabel = sf.includes(' - ') ? sf.split(' - ').slice(1).join(' - ') : null;
                const catIcon = SERVICE_TREE.find((c) => c.label === parentLabel)?.icon || 'fa-concierge-bell';
                return (
                  <span key={sf} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-600">
                    <i className={`fas ${catIcon} text-[9px]`}></i>
                    <span>{subLabel ? `${parentLabel} › ${subLabel}` : parentLabel}</span>
                    <button onClick={() => setServiceFilter((prev) => prev.filter((v) => v !== sf))} className="hover:opacity-70"><i className="fas fa-times text-[8px]"></i></button>
                  </span>
                );
              })}
              {searchQuery && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">
                  &quot;{searchQuery}&quot;
                  <button onClick={() => setSearchQuery('')} className="hover:opacity-70"><i className="fas fa-times text-[8px]"></i></button>
                </span>
              )}
              <span className="text-xs text-gray-400 ml-1">
                {(isSearching || statusFilter || serviceFilter.length > 0) ? 'Across all folders \u00b7 ' : ''}
                {filteredFiles.length} result{filteredFiles.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      ))}

      {/* Breadcrumbs */}
      <div
        className={`bg-white rounded-xl border px-4 py-3 mb-4 shadow-sm transition-all duration-200 ${
          dragOverBreadcrumb === 'root'
            ? 'border-primary/40 bg-primary/[0.02] shadow-md'
            : isDraggingAny
            ? 'border-dashed border-primary/50 bg-primary/[0.015] shadow-sm'
            : 'border-gray-100'
        }`}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setDragOverBreadcrumb(null);
        }}
      >
        {isDraggingAny && dragOverBreadcrumb === null && (
          <div className="flex items-center gap-2 mb-2 px-0.5 animate-pulse">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-primary/10 flex-shrink-0">
              <i className="fas fa-location-arrow text-primary text-[9px] -rotate-45"></i>
            </span>
            <p className="text-[11px] text-primary/80 font-medium leading-tight">
              Drag here to move to <span className="font-semibold">All Files</span> or a parent folder
            </p>
          </div>
        )}
        {dragOverBreadcrumb !== null && (
          <p className="text-[10px] text-primary/70 font-medium mb-1.5 flex items-center gap-1">
            <i className="fas fa-arrows-alt text-[9px]"></i>
            Drop to move here
          </p>
        )}
        <div className="flex items-center gap-1 text-sm overflow-x-auto">
          {/* Root view toggle: General / Per User */}
          {!selectedUserEmail && !currentFolderId && (
            <div className="inline-flex items-center bg-gray-100 rounded-lg p-0.5 mr-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => { setRootViewMode('general'); setCurrentFolderId(null); setSelectedUserEmail(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 whitespace-nowrap ${rootViewMode === 'general' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-dark-text'}`}
              >
                <i className="fas fa-layer-group text-[10px]"></i>
                General
              </button>
              <button
                type="button"
                onClick={() => { setRootViewMode('users'); setCurrentFolderId(null); setSelectedUserEmail(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 whitespace-nowrap ${rootViewMode === 'users' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-dark-text'}`}
              >
                <i className="fas fa-users text-[10px]"></i>
                Per User
              </button>
            </div>
          )}

          {/* Root breadcrumb */}
          <button
            type="button"
            onClick={() => { setSelectedUserEmail(null); setCurrentFolderId(null); }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setDragOverBreadcrumb('root'); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverBreadcrumb(null); handleDrop(e, null); }}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all duration-150 whitespace-nowrap ${
              dragOverBreadcrumb === 'root'
                ? 'bg-primary/10 text-primary border border-primary/30 scale-105 shadow-sm'
                : !selectedUserEmail && !currentFolderId
                ? 'text-primary font-semibold bg-primary/5'
                : 'text-gray-text hover:text-dark-text hover:bg-gray-50'
            }`}
          >
            <i className={`fas ${rootViewMode === 'general' && !selectedUserEmail ? 'fa-layer-group' : 'fa-users'} text-xs`}></i>
            {rootViewMode === 'general' && !selectedUserEmail ? 'All Files' : 'All Users'}
            {dragOverBreadcrumb === 'root' && <i className="fas fa-download text-[9px] ml-0.5 opacity-60"></i>}
          </button>

          {selectedUserEmail && (
            <>
              <i className="fas fa-chevron-right text-[9px] text-gray-300 flex-shrink-0"></i>
              <button
                type="button"
                onClick={() => setCurrentFolderId(null)}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setDragOverBreadcrumb('user'); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverBreadcrumb(null); handleDrop(e, null); }}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all duration-150 whitespace-nowrap ${
                  dragOverBreadcrumb === 'user'
                    ? 'bg-primary/10 text-primary border border-primary/30 scale-105 shadow-sm'
                    : !currentFolderId
                    ? 'text-primary font-semibold bg-primary/5'
                    : 'text-gray-text hover:text-dark-text hover:bg-gray-50'
                }`}
              >
                <i className="fas fa-user text-xs"></i>
                {selectedUserEmail}
                {dragOverBreadcrumb === 'user' && <i className="fas fa-download text-[9px] ml-1 opacity-60"></i>}
              </button>
            </>
          )}

          {/* Folder chain (when inside a folder) */}
          {currentFolderId && (() => {
            const folderMap = {};
            for (const f of allFolders) folderMap[f.id] = f;
            const chain = [];
            let cur = folderMap[currentFolderId];
            while (cur) {
              chain.unshift(cur);
              cur = cur.parentId ? folderMap[cur.parentId] : null;
            }
            return chain.map((folder) => (
              <div key={folder.id} className="flex items-center gap-1">
                <i className="fas fa-chevron-right text-[9px] text-gray-300 flex-shrink-0"></i>
                <button
                  type="button"
                  onClick={() => setCurrentFolderId(folder.id)}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setDragOverBreadcrumb(folder.id); }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverBreadcrumb(null); handleDrop(e, folder.id); }}
                  className={`px-2 py-1 rounded-lg transition-all duration-150 whitespace-nowrap ${
                    dragOverBreadcrumb === folder.id
                      ? 'bg-primary/10 text-primary border border-primary/30 scale-105 shadow-sm'
                      : folder.id === currentFolderId
                      ? 'text-primary font-semibold bg-primary/5'
                      : 'text-gray-text hover:text-dark-text hover:bg-gray-50'
                  }`}
                >
                  {folder.name}
                  {dragOverBreadcrumb === folder.id && <i className="fas fa-download text-[9px] ml-1.5 opacity-60"></i>}
                </button>
              </div>
            ));
          })()}
        </div>
      </div>

      {import.meta.env.DEV && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold text-red-700 bg-red-100 border border-red-200">
            <i className="fas fa-flask text-[10px]"></i>
            Development Only
          </span>
          <p className="text-xs text-red-700">Wipes all files and folders for testing.</p>
          <Button
            type="button"
            onClick={() => setDeleteAllDevConfirm(true)}
            disabled={bulkLoading}
            variant="destructive"
            size="sm"
            className="ml-auto"
          >
            {bulkLoading ? <i className="fas fa-spinner fa-spin text-[10px]"></i> : <i className="fas fa-trash-alt text-[10px]"></i>}
            Delete All Files & Folders
          </Button>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="bg-white rounded-xl border border-primary/20 p-3 shadow-sm flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <i className="fas fa-check-double text-primary text-xs"></i>
            </div>
            <span className="text-sm font-medium text-dark-text">
              {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
            </span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              onClick={handleBulkDownload}
              disabled={bulkLoading || selectedFileCount === 0}
              variant="secondary"
              size="sm"
              className="text-primary bg-primary/5 hover:bg-primary/10"
            >
              {bulkLoading ? <i className="fas fa-spinner fa-spin text-[10px]"></i> : <i className="fas fa-download text-[10px]"></i>}
              Download ZIP
            </Button>
            <Button
              onClick={() => setBulkMoveActive(true)}
              disabled={bulkLoading}
              variant="secondary"
              size="sm"
              className="text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
            >
              <i className="fas fa-folder-open text-[10px]"></i>
              Move to Folder
            </Button>
            <Button
              onClick={() => setBulkDeleteConfirm(true)}
              variant="ghost"
              size="sm"
              className="text-red-500 hover:bg-red-50"
            >
              <i className="fas fa-trash-alt text-[10px]"></i>
              Delete Selected
            </Button>
            <Button
              onClick={() => setSelectedIds(new Set())}
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-dark-text hover:bg-gray-50"
            >
              <i className="fas fa-times text-[10px]"></i>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="text-center py-24">
          <i className="fas fa-spinner fa-spin text-3xl text-primary mb-4 block"></i>
          <p className="text-sm text-gray-text">Loading files...</p>
        </div>
      ) : isAtVirtualRoot ? (
        /* ── Virtual User Folders (admin root) ── */
        <div className="space-y-4">
          {/* Global overview stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total Users', value: globalStats.totalUsers, icon: 'fa-users', bg: 'bg-indigo-50', text: 'text-indigo-600', iconBg: 'bg-indigo-100' },
              { label: 'Total Files', value: globalStats.totalFiles, icon: 'fa-file-alt', bg: 'bg-sky-50', text: 'text-sky-600', iconBg: 'bg-sky-100' },
              { label: 'Total Folders', value: globalStats.totalFolders, icon: 'fa-folder', bg: 'bg-violet-50', text: 'text-violet-600', iconBg: 'bg-violet-100' },
              { label: 'Total Size', value: formatSize(globalStats.totalSize), icon: 'fa-database', bg: 'bg-emerald-50', text: 'text-emerald-600', iconBg: 'bg-emerald-100' },
              { label: 'Pending', value: globalStats.pending, icon: 'fa-clock', bg: 'bg-amber-50', text: 'text-amber-600', iconBg: 'bg-amber-100' },
              { label: 'Transcribed', value: globalStats.transcribed, icon: 'fa-check-circle', bg: 'bg-green-50', text: 'text-green-600', iconBg: 'bg-green-100' },
            ].map((stat) => (
              <div key={stat.label} className={`${stat.bg} rounded-xl border border-gray-100 p-4 flex items-center gap-3`}>
                <div className={`w-9 h-9 rounded-lg ${stat.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <i className={`fas ${stat.icon} ${stat.text} text-sm`}></i>
                </div>
                <div className="min-w-0">
                  <p className={`text-lg font-bold ${stat.text} leading-tight`}>{stat.value}</p>
                  <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* In-Progress highlight when > 0 */}
          {globalStats['in-progress'] > 0 && (
            <div className="bg-sky-50 rounded-xl border border-sky-100 px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
                <i className="fas fa-arrows-rotate text-sky-600 text-sm"></i>
              </div>
              <p className="text-sm text-sky-700 font-medium">
                {globalStats['in-progress']} file{globalStats['in-progress'] !== 1 ? 's' : ''} currently in progress
              </p>
            </div>
          )}

          {/* Search bar */}
          <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
            <div className="relative">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-sm"></i>
              <input
                type="text"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="Search users by email..."
                className="w-full pl-9 pr-8 py-2.5 text-sm rounded-lg border border-gray-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 outline-none transition-all placeholder:text-gray-300"
              />
              {userSearchQuery && (
                <button
                  type="button"
                  onClick={() => setUserSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                >
                  <i className="fas fa-times text-xs"></i>
                </button>
              )}
            </div>
            {userSearchQuery.trim() && (
              <p className="text-[11px] text-gray-400 mt-2 px-1">
                {filteredUserFolders.length} user{filteredUserFolders.length !== 1 ? 's' : ''} matching &ldquo;{userSearchQuery.trim()}&rdquo;
              </p>
            )}
          </div>

          {/* User cards grid */}
          {filteredUserFolders.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className={`fas ${userSearchQuery.trim() ? 'fa-search' : 'fa-users'} text-primary text-lg`}></i>
              </div>
              <p className="text-sm font-medium text-dark-text">
                {userSearchQuery.trim() ? 'No users match your search' : 'No users have uploaded files yet'}
              </p>
              <p className="text-xs text-gray-text mt-1">
                {userSearchQuery.trim() ? 'Try a different email address.' : 'User folders will appear here once files are uploaded.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {paginatedUserFolders.map((vu) => (
                <button
                  key={vu.email}
                  type="button"
                  onClick={() => { setSelectedUserEmail(vu.email); setUserSearchQuery(''); }}
                  className="bg-white rounded-xl border border-gray-100 hover:border-primary/30 hover:shadow-md p-5 text-left transition-all group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-sky-50 group-hover:bg-sky-100 transition-colors overflow-hidden">
                      <img src="/favicon.png" alt="" className="w-6 h-6 object-contain" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-dark-text truncate">{vu.email}</p>
                      <p className="text-[11px] text-gray-text mt-0.5">
                        {vu.fileCount} file{vu.fileCount !== 1 ? 's' : ''} &middot; {vu.folderCount} folder{vu.folderCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <i className="fas fa-chevron-right text-gray-300 text-xs group-hover:text-primary transition-colors"></i>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-gray-text">
                    {vu.totalSize > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <i className="fas fa-database text-[9px]"></i>
                        {formatSize(vu.totalSize)}
                      </span>
                    )}
                    {vu.latestUpload && (
                      <span className="inline-flex items-center gap-1">
                        <i className="fas fa-clock text-[9px]"></i>
                        {formatDate(vu.latestUpload.toISOString())}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* User pagination */}
          {totalUserPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
              <p className="text-xs text-gray-500">
                Page <span className="font-semibold text-dark-text">{userPage}</span> of <span className="font-semibold text-dark-text">{totalUserPages}</span>
                <span className="mx-1.5 text-gray-300">&middot;</span>
                Showing {paginatedUserFolders.length} of {filteredUserFolders.length} users
              </p>
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                  disabled={userPage <= 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <i className="fas fa-chevron-left text-[10px]"></i>
                  Prev
                </button>
                {getPageNumbers(userPage, totalUserPages).map((p, idx) =>
                  p === '...' ? (
                    <span key={`u-ellipsis-${idx}`} className="px-2 py-1.5 text-xs text-gray-400 select-none">&hellip;</span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setUserPage(p)}
                      className={`min-w-[32px] h-[30px] px-2 rounded-lg border text-xs font-medium transition-colors ${
                        p === userPage
                          ? 'bg-primary text-white border-primary shadow-sm'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => setUserPage((p) => Math.min(totalUserPages, p + 1))}
                  disabled={userPage >= totalUserPages}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <i className="fas fa-chevron-right text-[10px]"></i>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : totalItems === 0 && !hasActiveFilters ? (
        <div className="text-center py-24 bg-white rounded-2xl border border-gray-100">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className={`fas ${currentFolderId ? 'fa-folder-open' : 'fa-folder-open'} text-primary text-xl`}></i>
          </div>
          <p className="text-sm font-medium text-dark-text">
            {currentFolderId ? 'This folder is empty' : 'No files uploaded yet'}
          </p>
          <p className="text-xs text-gray-text mt-1 mb-5">
            {currentFolderId ? 'Drag files here or upload new ones.' : 'No files uploaded yet.'}
          </p>
          <div className="flex items-center gap-3 justify-center">
            <button
              onClick={() => setShowCreateFolder(true)}
              className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              <i className="fas fa-folder-plus text-xs"></i>
              {createFolderButtonLabel}
            </button>
            <Link
              to={uploadLink}
              className="inline-flex items-center gap-2 btn-gradient text-white px-6 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all"
            >
              <i className="fas fa-plus text-xs"></i>
              {uploadButtonLabel}
            </Link>
          </div>
        </div>
      ) : filteredFiles.length === 0 && currentSubfolders.length === 0 && hasActiveFilters ? (
        <div className="text-center py-24 bg-white rounded-2xl border border-gray-100">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-search text-primary text-xl"></i>
          </div>
          <p className="text-sm font-medium text-dark-text">No files match your filters</p>
          <p className="text-xs text-gray-text mt-1 mb-5">Try adjusting your search or filters.</p>
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors"
          >
            <i className="fas fa-times text-xs"></i>
            Clear all filters
          </button>
        </div>
      ) : viewMode === 'list' ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-center px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-text uppercase tracking-wider">File</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-text uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-text uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-text uppercase tracking-wider">Uploaded By</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-text uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-text uppercase tracking-wider">Size</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold text-gray-text uppercase tracking-wider w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {/* Folder rows first */}
                {paginatedFolders.map((folder) => {
                  if (renamingFolder === folder.id) {
                    return (
                      <tr key={folder.id} className="bg-primary/[0.03]">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-500">
                              <i className="fas fa-folder text-xs"></i>
                            </div>
                            <form
                              className="flex-1 flex items-center gap-2"
                              onSubmit={(e) => {
                                e.preventDefault();
                                if (renameValue.trim()) handleRenameFolder(folder.id, renameValue.trim());
                              }}
                            >
                              <input
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                autoFocus
                                className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-dark-text focus:outline-none focus:ring-2 focus:ring-primary/20"
                                onBlur={() => setRenamingFolder(null)}
                                onKeyDown={(e) => { if (e.key === 'Escape') setRenamingFolder(null); }}
                              />
                              <button type="submit" className="text-primary hover:text-primary-dark">
                                <i className="fas fa-check text-sm"></i>
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <FolderRow
                      key={folder.id}
                      folder={folder}
                      onOpen={(id) => setCurrentFolderId(id)}
                      onContextMenu={handleFolderContextMenu}
                      isSelected={selectedIds.has(folder.id)}
                      onSelect={handleSelectClick}
                      isDragOver={dragOverFolder === folder.id}
                      onDragOver={setDragOverFolder}
                      onDragLeave={() => setDragOverFolder(null)}
                      onDrop={handleDrop}
                      onDragStart={handleDragStart}
                      itemCount={folderItemCounts[folder.id] || 0}
                      totalSize={folderSizes[folder.id] || 0}
                      onDelete={(id) => setDeleteFolderConfirm(id)}
                    />
                  );
                })}

                {/* File rows */}
                {paginatedFiles.map((file) => {
                  const cfg = STATUS_CONFIG[file.status] || STATUS_CONFIG.pending;
                  const isSelected = selectedIds.has(file.id);
                  const urlPlatform = file.sourceType === 'url' ? getUrlPlatform(file.sourceUrl || file.sourceReferenceUrl || file.url) : null;
                  const fileIconClass = urlPlatform ? urlPlatform.icon : `fas ${getFileIcon(file.type)}`;
                  const fileIconColor = urlPlatform ? urlPlatform.color : getFileIconColor(file.type);
                  return (
                    <React.Fragment key={file.id}>
                    <tr
                      className={`transition-colors cursor-pointer ${isSelected ? 'bg-primary/[0.03]' : 'hover:bg-gray-50/50'}`}
                      draggable={renamingFileId !== file.id}
                      onDragStart={(e) => handleDragStart(e, file, 'file')}
                      onContextMenu={(e) => handleFileContextMenu(e, file)}
                      onClick={(e) => {
                        if ((e.ctrlKey || e.metaKey || e.shiftKey) && !['INPUT', 'BUTTON', 'A'].includes(e.target.tagName)) {
                          e.preventDefault();
                          handleSelectClick(file.id, e);
                        }
                      }}
                    >
                      <td className="text-center px-3 py-3.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectClick(file.id)}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setPreviewFile(file)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${fileIconColor} hover:scale-105 transition-transform cursor-pointer`}
                            title="Preview file"
                          >
                            <i className={`${fileIconClass} text-xs`}></i>
                          </button>
                          <div className="min-w-0">
                            {renamingFileId === file.id ? (
                              <form
                                className="flex items-center gap-1"
                                onSubmit={(e) => { e.preventDefault(); handleRenameFile(file.id, renameFileValue.trim() + renameFileExt); }}
                              >
                                <input
                                  type="text"
                                  value={renameFileValue}
                                  onChange={(e) => setRenameFileValue(e.target.value)}
                                  autoFocus
                                  className="flex-1 px-2 py-1 bg-gray-50 border border-primary/40 rounded text-sm text-dark-text focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-0 max-w-[160px]"
                                  onKeyDown={(e) => { if (e.key === 'Escape') setRenamingFileId(null); }}
                                />
                                {renameFileExt && <span className="text-sm text-gray-400 flex-shrink-0">{renameFileExt}</span>}
                                <button type="submit" className="text-primary hover:text-primary-dark flex-shrink-0">
                                  <i className="fas fa-check text-xs"></i>
                                </button>
                                <button type="button" onClick={() => setRenamingFileId(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                                  <i className="fas fa-times text-xs"></i>
                                </button>
                              </form>
                            ) : (
                              <span
                                className="text-sm font-medium text-dark-text truncate block max-w-[200px] cursor-pointer hover:text-primary transition-colors"
                                title={file.originalName}
                                onClick={() => setPreviewFile(file)}
                              >
                                {file.originalName}
                              </span>
                            )}
                            {file.description && (
                              <p className="text-[10px] text-gray-400 truncate max-w-[200px] mt-0.5" title={file.description}>
                                {file.description}
                              </p>
                            )}
                            {statusFilter && !isInsideFolder && file.folderId && (
                              <button
                                type="button"
                                onClick={() => setCurrentFolderId(file.folderId)}
                                className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-600 border border-violet-100 hover:bg-violet-100 transition-colors"
                                title={`Open folder: ${folderMap[file.folderId] || 'folder'}`}
                              >
                                <i className="fas fa-folder text-[8px]"></i>
                                {folderMap[file.folderId] || 'folder'}
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {urlPlatform ? (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${urlPlatform.color}`}>
                            {urlPlatform.label}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-text">
                            {getFileTypeLabel(file.type) || '--'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {statusLoading === file.id ? (
                          <i className="fas fa-spinner fa-spin text-primary text-sm"></i>
                        ) : (
                          <div className="relative inline-block">
                            <select
                              value={file.status || 'pending'}
                              onChange={(e) => handleStatusChange(file.id, e.target.value)}
                              className={`appearance-none px-2.5 py-1 pr-7 rounded-md border text-[11px] font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 ${cfg.bg} ${cfg.text} ${cfg.border}`}
                            >
                              {STATUS_OPTIONS.map((s) => (
                                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                              ))}
                            </select>
                            <i className={`fas fa-chevron-down absolute right-2 top-1/2 -translate-y-1/2 text-[8px] pointer-events-none ${cfg.text}`}></i>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm text-gray-text" title={getUploadedByLabel(file)}>{getUploadedByLabel(file)}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm text-gray-text">{formatRelativeDate(file.uploadedAt)}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm text-gray-text">{file.size > 0 ? formatSize(file.size) : '--'}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            onClick={() => setPreviewFile(file)}
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-[11px] font-medium text-gray-400 hover:text-primary hover:bg-primary/5"
                            title="Preview file"
                          >
                            <i className="fas fa-eye text-[10px]"></i>
                            View
                          </Button>
                          <Button
                            type="button"
                            onClick={() => setDeleteConfirm(file.id)}
                            disabled={deleteLoading === file.id}
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-[11px] font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Delete file"
                          >
                            {deleteLoading === file.id ? (
                              <i className="fas fa-spinner fa-spin text-[10px]"></i>
                            ) : (
                              <i className="fas fa-trash-alt text-[10px]"></i>
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {/* Transcription sub-row */}
                    {file.transcriptionUrl && (
                      <tr
                        className="bg-emerald-50/30"
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, file, type: 'transcription' });
                        }}
                      >
                        <td className="px-3 py-2"></td>
                        <td className="px-4 py-2" colSpan={4}>
                          <div className="flex items-center gap-2.5 pl-11">
                            <span className="text-gray-300 text-xs select-none">└─</span>
                            <div className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center flex-shrink-0">
                              <i className="fas fa-file-circle-check text-emerald-500 text-[10px]"></i>
                            </div>
                            <button
                              type="button"
                                      onClick={() => openTranscriptionPreview(file)}
                              className="text-[12px] font-medium text-dark-text truncate max-w-[220px] hover:text-primary transition-colors text-left"
                              title={file.transcriptionName}
                            >
                              {file.transcriptionName || 'Transcription'}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-[11px] text-gray-text">
                            {file.transcriptionAttachedAt ? formatRelativeDate(typeof file.transcriptionAttachedAt === 'object' && file.transcriptionAttachedAt.toDate ? file.transcriptionAttachedAt.toDate().toISOString() : file.transcriptionAttachedAt) : '--'}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-[11px] text-gray-text">{file.transcriptionSize > 0 ? formatSize(file.transcriptionSize) : '--'}</span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                                onClick={() => openTranscriptionPreview(file)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
                              title="View transcription"
                            >
                              <i className="fas fa-eye text-[10px]"></i>
                              View
                            </button>
                            <button
                              onClick={() => triggerDirectDownload(file.transcriptionUrl, file.transcriptionName || 'Transcription', `trans-${file.id}`)}
                              disabled={downloadLoadingKey === `trans-${file.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                              title="Download transcription"
                            >
                              {downloadLoadingKey === `trans-${file.id}` ? (
                                <i className="fas fa-spinner fa-spin text-[10px]"></i>
                              ) : (
                                <i className="fas fa-download text-[10px]"></i>
                              )}
                              {downloadLoadingKey === `trans-${file.id}` ? 'Downloading...' : 'Download'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemoveTranscriptionConfirm({ id: file.id, name: file.transcriptionName || 'Transcription' })}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Remove transcription"
                            >
                              <i className="fas fa-trash-alt text-[10px]"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden p-4 space-y-3">
            {/* Mobile folder cards */}
            {paginatedFolders.map((folder) => (
              <FolderCard
                key={folder.id}
                folder={folder}
                onOpen={(id) => setCurrentFolderId(id)}
                onContextMenu={handleFolderContextMenu}
                isSelected={selectedIds.has(folder.id)}
                onSelect={handleSelectClick}
                isDragOver={dragOverFolder === folder.id}
                onDragOver={setDragOverFolder}
                onDragLeave={() => setDragOverFolder(null)}
                onDrop={handleDrop}
                onDragStart={handleDragStart}
                itemCount={folderItemCounts[folder.id] || 0}
                totalSize={folderSizes[folder.id] || 0}
                showOwner
                onDelete={(id) => setDeleteFolderConfirm(id)}
              />
            ))}

            {/* Mobile file cards */}
            {paginatedFiles.map((file) => {
              const cfg = STATUS_CONFIG[file.status] || STATUS_CONFIG.pending;
              const isSelected = selectedIds.has(file.id);
              const urlPlatform = file.sourceType === 'url' ? getUrlPlatform(file.sourceUrl || file.sourceReferenceUrl || file.url) : null;
              const fileIconClass = urlPlatform ? urlPlatform.icon : `fas ${getFileIcon(file.type)}`;
              const fileIconColor = urlPlatform ? urlPlatform.color : getFileIconColor(file.type);
              return (
                <div
                  key={file.id}
                  className={`p-4 rounded-xl border transition-colors ${isSelected ? 'border-primary/30 bg-primary/[0.02]' : 'border-gray-100'}`}
                  draggable={renamingFileId !== file.id}
                  onDragStart={(e) => handleDragStart(e, file, 'file')}
                  onContextMenu={(e) => handleFileContextMenu(e, file)}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleSelectClick(file.id)}
                      className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer mt-1"
                    />
                    <button
                      type="button"
                      onClick={() => setPreviewFile(file)}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${fileIconColor} cursor-pointer hover:scale-105 transition-transform`}
                    >
                      <i className={`${fileIconClass} text-sm`}></i>
                    </button>
                    <div className="flex-1 min-w-0">
                      {renamingFileId === file.id ? (
                        <form
                          className="flex items-center gap-1 mb-1"
                          onSubmit={(e) => { e.preventDefault(); handleRenameFile(file.id, renameFileValue.trim() + renameFileExt); }}
                        >
                          <input
                            type="text"
                            value={renameFileValue}
                            onChange={(e) => setRenameFileValue(e.target.value)}
                            autoFocus
                            className="flex-1 px-2 py-1 bg-gray-50 border border-primary/40 rounded text-sm text-dark-text focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-0"
                            onKeyDown={(e) => { if (e.key === 'Escape') setRenamingFileId(null); }}
                          />
                          {renameFileExt && <span className="text-sm text-gray-400 flex-shrink-0">{renameFileExt}</span>}
                          <button type="submit" className="text-primary hover:text-primary-dark flex-shrink-0">
                            <i className="fas fa-check text-xs"></i>
                          </button>
                          <button type="button" onClick={() => setRenamingFileId(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                            <i className="fas fa-times text-xs"></i>
                          </button>
                        </form>
                      ) : (
                        <p className="text-sm font-medium text-dark-text truncate">{file.originalName}</p>
                      )}
                      {file.description && (
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">{file.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400 mt-1.5">
                        <span title={getUploadedByLabel(file)}><i className="fas fa-user mr-1 text-[9px]"></i>{getUploadedByLabel(file)}</span>
                        <span>{formatSize(file.size)}</span>
                        <span>{formatRelativeDate(file.uploadedAt)}</span>
                        {urlPlatform && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${urlPlatform.color}`}>
                            {urlPlatform.label}
                          </span>
                        )}
                        {statusFilter && !isInsideFolder && file.folderId && (
                          <button
                            type="button"
                            onClick={() => setCurrentFolderId(file.folderId)}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-500 border border-indigo-100 hover:bg-indigo-100 transition-colors"
                            title={`Open folder: ${folderMap[file.folderId] || 'folder'}`}
                          >
                            <i className="fas fa-folder text-[8px]"></i>
                            {folderMap[file.folderId] || 'folder'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="ml-13 flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setPreviewFile(file)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
                    >
                      <i className="fas fa-eye text-[10px]"></i>
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(file.id)}
                      disabled={deleteLoading === file.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {deleteLoading === file.id ? (
                        <i className="fas fa-spinner fa-spin text-[10px]"></i>
                      ) : (
                        <><i className="fas fa-trash-alt text-[10px]"></i>Delete</>
                      )}
                    </button>
                    {statusLoading === file.id ? (
                      <i className="fas fa-spinner fa-spin text-primary text-sm ml-auto"></i>
                    ) : (
                      <div className="relative inline-block ml-auto">
                        <select
                          value={file.status || 'pending'}
                          onChange={(e) => handleStatusChange(file.id, e.target.value)}
                          className={`appearance-none px-2.5 py-1.5 pr-7 rounded-md border text-[11px] font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 ${cfg.bg} ${cfg.text} ${cfg.border}`}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                          ))}
                        </select>
                        <i className={`fas fa-chevron-down absolute right-2 top-1/2 -translate-y-1/2 text-[8px] pointer-events-none ${cfg.text}`}></i>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile select all bar */}
          <div className="lg:hidden px-4 pb-3">
            <Button
              onClick={toggleSelectAll}
              variant="outline"
              size="sm"
              className="w-full h-auto py-2.5 text-xs text-gray-text hover:bg-gray-50 gap-2"
            >
              <input type="checkbox" checked={allSelected} readOnly className="w-3.5 h-3.5 rounded border-gray-300 text-primary pointer-events-none" />
              {allSelected ? 'Deselect All' : 'Select All'}
              <span className="text-gray-300 font-mono text-[9px]">Ctrl+A</span>
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
          onDragOver={(e) => {
            if (e.target === e.currentTarget) {
              e.preventDefault();
            }
          }}
          onDrop={(e) => {
            if (e.target === e.currentTarget) {
              e.preventDefault();
              handleDrop(e, currentFolderId);
            }
          }}
        >
          {paginatedFolders.map((folder) => {
            if (renamingFolder === folder.id) {
              return (
                <div key={folder.id} className="bg-white rounded-xl border border-primary/30 p-5 ring-2 ring-primary/20">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-500">
                      <i className="fas fa-folder text-lg"></i>
                    </div>
                    <form
                      className="flex-1 flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (renameValue.trim()) handleRenameFolder(folder.id, renameValue.trim());
                      }}
                    >
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        autoFocus
                        className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-dark-text focus:outline-none focus:ring-2 focus:ring-primary/20"
                        onBlur={() => setRenamingFolder(null)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setRenamingFolder(null); }}
                      />
                      <button type="submit" className="text-primary hover:text-primary-dark">
                        <i className="fas fa-check text-sm"></i>
                      </button>
                    </form>
                  </div>
                </div>
              );
            }

            return (
              <FolderCard
                key={folder.id}
                folder={folder}
                onOpen={(id) => setCurrentFolderId(id)}
                onContextMenu={handleFolderContextMenu}
                isSelected={selectedIds.has(folder.id)}
                onSelect={handleSelectClick}
                isDragOver={dragOverFolder === folder.id}
                onDragOver={setDragOverFolder}
                onDragLeave={() => setDragOverFolder(null)}
                onDrop={handleDrop}
                onDragStart={handleDragStart}
                itemCount={folderItemCounts[folder.id] || 0}
                totalSize={folderSizes[folder.id] || 0}
                showOwner
                onDelete={(id) => setDeleteFolderConfirm(id)}
              />
            );
          })}

          {paginatedFiles.map((file) => {
            const isSelected = selectedIds.has(file.id);
            return (
              <div
                key={file.id}
                className="transition-all"
                draggable={renamingFileId !== file.id}
                onDragStart={(e) => handleDragStart(e, file, 'file')}
                onContextMenu={(e) => handleFileContextMenu(e, file)}
              >
                <FileCard
                  file={file}
                  isAdmin
                  onStatusChange={handleStatusChange}
                  onPreview={setPreviewFile}
                  isSelected={isSelected}
                  onSelect={handleSelectClick}
                  onDelete={(id) => setDeleteConfirm(id)}
                  deleteLoading={deleteLoading === file.id}
                  folderName={statusFilter && !isInsideFolder && file.folderId ? (folderMap[file.folderId] || 'folder') : ''}
                  onOpenFolder={statusFilter && !isInsideFolder && file.folderId ? () => setCurrentFolderId(file.folderId) : undefined}
                  onTranscription={(f) => setTranscriptionTarget(f)}
                />
              </div>
            );
          })}

          {(filteredFiles.length > 0 || currentSubfolders.length > 0) && (
            <div className="md:col-span-2 xl:col-span-3">
              <button
                onClick={toggleSelectAll}
                className="w-full py-2.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-text hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
              >
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  readOnly
                  className="w-3.5 h-3.5 rounded border-gray-300 text-primary pointer-events-none"
                />
                {allSelected ? 'Deselect All' : 'Select All'}
                <span className="text-gray-300 font-mono text-[9px]">Ctrl+A</span>
              </button>
            </div>
          )}
        </div>
      )}

      {allPageItems.length > 0 && (
        <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
          <p className="text-xs text-gray-500">
            Page <span className="font-semibold text-dark-text">{currentPage}</span> of <span className="font-semibold text-dark-text">{totalFilePages}</span>
            <span className="mx-1.5 text-gray-300">·</span>
            Showing {paginatedItems.length} of {allPageItems.length} files &amp; folders
          </p>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <i className="fas fa-chevron-left text-[10px]"></i>
              Prev
            </button>
            {getPageNumbers(currentPage, totalFilePages).map((p, idx) =>
              p === '...' ? (
                <span key={`ellipsis-${idx}`} className="px-2 py-1.5 text-xs text-gray-400 select-none">…</span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCurrentPage(p)}
                  className={`min-w-[32px] h-[30px] px-2 rounded-lg border text-xs font-medium transition-colors ${
                    p === currentPage
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalFilePages, p + 1))}
              disabled={currentPage >= totalFilePages}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <i className="fas fa-chevron-right text-[10px]"></i>
            </button>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          canEditDescription={true}
          onSaveDescription={handleUpdateDescription}
        />
      )}

      {/* Properties Modals */}
      {propertiesFile && <FilePropertiesModal file={propertiesFile} onClose={() => setPropertiesFile(null)} />}
      {propertiesFolder && (
        <FolderPropertiesModal
          folder={propertiesFolder}
          itemCount={folderItemCounts[propertiesFolder.id] || 0}
          totalSize={folderSizes[propertiesFolder.id] || 0}
          onClose={() => setPropertiesFolder(null)}
        />
      )}

      {/* Create Folder Modal */}
      <CreateFolderModal
        isOpen={showCreateFolder}
        onClose={() => setShowCreateFolder(false)}
        onCreateFolder={handleCreateFolder}
        parentFolderId={currentFolderId}
        title={selectedUserEmail ? 'Create Folder to this User' : 'New Folder'}
        subtitle={selectedUserEmail ? `Create a new folder for ${selectedUserEmail}.` : 'Create a new folder to organize your files'}
        submitLabel={selectedUserEmail ? 'Create Folder to this User' : 'Create Folder'}
      />

      {/* Move Modal */}
      {moveTarget && (
        <MoveFolderModal
          isOpen={true}
          onClose={() => setMoveTarget(null)}
          onSelect={handleMoveConfirm}
          folders={allFolders}
          excludeIds={moveTarget.type === 'folder' ? getDescendantIds(moveTarget.item.id) : []}
          title={moveTarget.type === 'file' ? `Move "${moveTarget.item.originalName}"` : `Move "${moveTarget.item.name}"`}
        />
      )}

      {/* Bulk Move Modal */}
      {bulkMoveActive && (
        <MoveFolderModal
          isOpen={true}
          onClose={() => setBulkMoveActive(false)}
          onSelect={handleBulkMove}
          folders={allFolders}
          excludeIds={[]}
          title={`Move ${selectedCount} selected item${selectedCount !== 1 ? 's' : ''} to folder`}
        />
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete File"
        message="Delete this file permanently?"
        confirmLabel="Delete"
        tone="danger"
        loading={deleteLoading === deleteConfirm}
        onConfirm={() => deleteConfirm && handleDeleteFile(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />

      <ConfirmDialog
        open={bulkDeleteConfirm}
        title="Delete Selected Items"
        message={`Delete ${selectedCount} selected item${selectedCount !== 1 ? 's' : ''}?`}
        confirmLabel="Delete Selected"
        tone="danger"
        loading={bulkLoading}
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={!!deleteFolderConfirm}
        title="Delete Folder"
        message="Delete this folder and all items inside it?"
        confirmLabel="Delete Folder"
        tone="danger"
        loading={bulkLoading}
        onConfirm={() => deleteFolderConfirm && handleDeleteFolder(deleteFolderConfirm)}
        onCancel={() => setDeleteFolderConfirm(null)}
      />

      <ConfirmDialog
        open={deleteAllDevConfirm}
        title="Delete All Files & Folders"
        message={`DEV ONLY: Permanently delete ${allFiles.length} file(s) and ${allFolders.length} folder(s)?`}
        confirmLabel="Delete Everything"
        tone="danger"
        loading={bulkLoading}
        onConfirm={handleDeleteAllDev}
        onCancel={() => setDeleteAllDevConfirm(false)}
      />

      <ConfirmDialog
        open={!!removeTranscriptionConfirm}
        title="Remove Transcription"
        message={`Remove transcription \"${removeTranscriptionConfirm?.name || 'Transcription'}\"?`}
        confirmLabel="Remove"
        tone="danger"
        loading={transcriptionRemoving}
        onConfirm={() => removeTranscriptionConfirm?.id && handleRemoveTranscription(removeTranscriptionConfirm.id)}
        onCancel={() => setRemoveTranscriptionConfirm(null)}
      />

      <RenameDialog
        open={!!renameModal}
        title={renameModal?.type === 'file' ? 'Rename File' : 'Rename Folder'}
        description={renameModal?.type === 'file' ? 'Enter a new file name.' : 'Enter a new folder name.'}
        initialValue={renameModal?.value || ''}
        suffix={renameModal?.type === 'file' ? (renameModal?.suffix || '') : ''}
        confirmLabel="Save"
        onConfirm={async (newName) => {
          if (!renameModal?.id) return;
          if (renameModal.type === 'file') {
            await handleRenameFile(renameModal.id, newName);
          } else {
            await handleRenameFolder(renameModal.id, newName);
          }
          setRenameModal(null);
        }}
        onClose={() => setRenameModal(null)}
      />

      {/* Change Status Modal */}
      {statusChangeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setStatusChangeTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-dark-text">Change Status</h3>
                <p className="text-xs text-gray-text mt-0.5 truncate max-w-[240px]">
                  {statusChangeTarget.bulkMode
                    ? `${statusChangeTarget.count} files selected`
                    : statusChangeTarget.originalName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStatusChangeTarget(null)}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 ml-3"
              >
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>
            <div className="p-5 space-y-2">
              {STATUS_OPTIONS.map((s) => {
                const scfg = STATUS_CONFIG[s];
                const isActive = !statusChangeTarget.bulkMode && (statusChangeTarget.status || 'pending') === s;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={statusLoading === statusChangeTarget.id || bulkLoading}
                    onClick={async () => {
                      if (statusChangeTarget.bulkMode) {
                        await handleBulkStatus(s);
                      } else {
                        await handleStatusChange(statusChangeTarget.id, s);
                      }
                      setStatusChangeTarget(null);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      isActive
                        ? `${scfg.bg} ${scfg.border} ${scfg.text}`
                        : 'border-gray-100 hover:bg-gray-50 text-dark-text'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? scfg.iconBg : 'bg-gray-100'}`}>
                      {(statusLoading === statusChangeTarget.id || bulkLoading) && isActive
                        ? <i className="fas fa-spinner fa-spin text-xs text-gray-400"></i>
                        : <i className={`fas ${scfg.icon} text-xs ${isActive ? scfg.text : 'text-gray-400'}`}></i>
                      }
                    </div>
                    <span className="text-sm font-medium flex-1 text-left">{scfg.label}</span>
                    {isActive && statusLoading !== statusChangeTarget.id && !bulkLoading && (
                      <i className="fas fa-check text-xs"></i>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 flex justify-end">
              <button
                type="button"
                onClick={() => setStatusChangeTarget(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-dark-text hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attach Transcription Modal */}
      {transcriptionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => !transcriptionUploading && setTranscriptionTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-dark-text">
                  {transcriptionTarget.transcriptionUrl ? 'Manage Transcription' : 'Attach Transcription'}
                </h3>
                <p className="text-xs text-gray-text mt-0.5 truncate max-w-[300px]" title={transcriptionTarget.originalName}>
                  For: {transcriptionTarget.originalName}
                </p>
              </div>
              <button
                onClick={() => !transcriptionUploading && setTranscriptionTarget(null)}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Current transcription info */}
              {transcriptionTarget.transcriptionUrl && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <i className="fas fa-file-circle-check text-emerald-600 text-sm"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-emerald-800 truncate">{transcriptionTarget.transcriptionName}</p>
                      <p className="text-[11px] text-emerald-600 mt-0.5">
                        {transcriptionTarget.transcriptionSize ? formatSize(transcriptionTarget.transcriptionSize) : ''}
                        {transcriptionTarget.transcriptionAttachedAt && (
                          <> &middot; Attached {formatDate(typeof transcriptionTarget.transcriptionAttachedAt === 'string' ? transcriptionTarget.transcriptionAttachedAt : transcriptionTarget.transcriptionAttachedAt?.toDate?.()?.toISOString?.() || '')}</>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => openTranscriptionPreview(transcriptionTarget)}
                        className="w-8 h-8 rounded-lg hover:bg-emerald-100 flex items-center justify-center text-emerald-600 transition-colors"
                        title="View transcription"
                      >
                        <i className="fas fa-eye text-xs"></i>
                      </button>
                      <button
                        onClick={() => setRemoveTranscriptionConfirm({ id: transcriptionTarget.id, name: transcriptionTarget.transcriptionName || 'Transcription' })}
                        className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-400 hover:text-red-600 transition-colors"
                        title="Remove transcription"
                      >
                        <i className="fas fa-trash-alt text-xs"></i>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Upload new transcription */}
              <div>
                <label className="block text-sm font-medium text-dark-text mb-2">
                  {transcriptionTarget.transcriptionUrl ? 'Replace with new file' : 'Upload transcription file'}
                </label>
                <div className="relative">
                  <input
                    type="file"
                    id="transcription-file-input"
                    accept=".pdf,.doc,.docx,.txt,.rtf,.odt,.xlsx,.xls,.csv,.pptx,.ppt"
                    className="hidden"
                    disabled={transcriptionUploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleAttachTranscription(transcriptionTarget.id, f);
                    }}
                  />
                  <label
                    htmlFor="transcription-file-input"
                    className={`flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                      transcriptionUploading
                        ? 'border-gray-200 bg-gray-50 cursor-wait'
                        : 'border-gray-200 hover:border-primary/40 hover:bg-primary/[0.02]'
                    }`}
                  >
                    {transcriptionUploading ? (
                      <>
                        <i className="fas fa-spinner fa-spin text-primary text-sm"></i>
                        <span className="text-sm text-gray-text">Uploading...</span>
                      </>
                    ) : (
                      <>
                        <i className="fas fa-cloud-upload-alt text-primary text-sm"></i>
                        <span className="text-sm text-gray-text">Choose a file (PDF, DOCX, TXT, etc.)</span>
                      </>
                    )}
                  </label>
                </div>
              </div>

              {/* Quick status change */}
              {!transcriptionTarget.transcriptionUrl && transcriptionTarget.status !== 'in-progress' && (
                <button
                  onClick={() => { handleStatusChange(transcriptionTarget.id, 'in-progress'); setTranscriptionTarget((prev) => prev ? { ...prev, status: 'in-progress' } : null); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-sky-600 bg-sky-50 hover:bg-sky-100 border border-sky-100 transition-colors"
                >
                  <i className="fas fa-arrows-rotate text-xs"></i>
                  Mark as In Progress
                </button>
              )}
              {transcriptionTarget.transcriptionUrl && transcriptionTarget.status !== 'transcribed' && (
                <button
                  onClick={() => { handleStatusChange(transcriptionTarget.id, 'transcribed'); setTranscriptionTarget((prev) => prev ? { ...prev, status: 'transcribed' } : null); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 transition-colors"
                >
                  <i className="fas fa-check-circle text-xs"></i>
                  Mark as Transcribed
                </button>
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 flex justify-end">
              <button
                onClick={() => !transcriptionUploading && setTranscriptionTarget(null)}
                disabled={transcriptionUploading}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-dark-text hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────── Transcriptions Tab ──────────────────────── */

function TranscriptionsTab() {
  const toast = useAppToast();
  const { transcriptions, loading, error, fetchTranscriptions } = useTranscriptions();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchTranscriptions({});
  }, [fetchTranscriptions]);

  useEffect(() => {
    if (!error) return;
    toast.error(error, 'Unable to load transcriptions');
  }, [error, toast]);

  const filteredTranscriptions = useMemo(() => {
    if (!searchQuery.trim()) return transcriptions;
    const q = searchQuery.toLowerCase().trim();
    return transcriptions.filter(
      (t) =>
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.fileName && t.fileName.toLowerCase().includes(q)) ||
        (t.createdByEmail && t.createdByEmail.toLowerCase().includes(q))
    );
  }, [transcriptions, searchQuery]);

  if (loading) {
    return (
      <div className="text-center py-24">
        <i className="fas fa-spinner fa-spin text-3xl text-primary mb-4 block"></i>
        <p className="text-sm text-gray-text">Loading transcriptions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-8">
        <p className="text-sm text-gray-text text-center">Couldn’t load transcriptions.</p>
        <div className="mt-4 text-center">
          <button
            onClick={() => fetchTranscriptions({})}
            className="text-sm text-primary hover:text-primary-dark transition-colors flex items-center gap-1.5 mx-auto"
          >
            <i className="fas fa-sync-alt text-xs"></i>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 text-sm"></i>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search transcriptions by title, file name, or author..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-dark-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <i className="fas fa-times text-xs"></i>
              </button>
            )}
          </div>
          <button
            onClick={() => fetchTranscriptions({})}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-gray-text hover:text-primary hover:bg-primary/5 rounded-lg transition-colors whitespace-nowrap"
          >
            <i className="fas fa-sync-alt text-xs"></i>
            Refresh
          </button>
        </div>
        {searchQuery && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-400">
              {filteredTranscriptions.length} of {transcriptions.length} transcriptions
            </span>
          </div>
        )}
      </div>

      {transcriptions.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl border border-gray-100">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-file-alt text-primary text-xl"></i>
          </div>
          <p className="text-sm font-medium text-dark-text">No transcriptions yet</p>
          <p className="text-xs text-gray-text mt-1 mb-5">Transcriptions for uploaded files will appear here.</p>
        </div>
      ) : filteredTranscriptions.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl border border-gray-100">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-search text-primary text-xl"></i>
          </div>
          <p className="text-sm font-medium text-dark-text">No transcriptions match your search</p>
          <p className="text-xs text-gray-text mt-1 mb-4">Try adjusting your search query.</p>
          <button onClick={() => setSearchQuery('')} className="text-sm font-medium text-primary hover:text-primary-dark transition-colors">
            Clear search
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-6 py-3 text-[11px] font-semibold text-gray-text uppercase tracking-wider">File Name</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-text uppercase tracking-wider">Transcription Title</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-text uppercase tracking-wider">Created</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-text uppercase tracking-wider">Created By</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold text-gray-text uppercase tracking-wider w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredTranscriptions.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0">
                          <i className="fas fa-file-audio text-xs"></i>
                        </div>
                        <span className="text-sm font-medium text-dark-text truncate max-w-[200px]" title={t.fileName || t.fileId}>
                          {t.fileName || t.fileId || '--'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-dark-text truncate block max-w-[220px]" title={t.title}>{t.title || 'Untitled'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-gray-text">{formatDate(t.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-gray-text">{t.createdByEmail || '--'}</span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <Link
                        to={`/admin/transcriptions/${t.fileId || t.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium text-primary hover:bg-primary/5 transition-colors"
                      >
                        <i className="fas fa-external-link-alt text-[10px]"></i>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden p-4 space-y-3">
            {filteredTranscriptions.map((t) => (
              <Link
                key={t.id}
                to={`/admin/transcriptions/${t.fileId || t.id}`}
                className="block p-4 rounded-xl border border-gray-100 hover:border-primary/20 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-file-audio text-sm"></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-dark-text truncate">{t.title || 'Untitled'}</p>
                    <p className="text-[11px] text-gray-400 truncate mt-0.5">{t.fileName || t.fileId || '--'}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400 mt-1.5">
                      <span><i className="fas fa-user mr-1 text-[9px]"></i>{t.createdByEmail || '--'}</span>
                      <span><i className="fas fa-calendar mr-1 text-[9px]"></i>{formatRelativeDate(t.createdAt)}</span>
                    </div>
                  </div>
                  <i className="fas fa-chevron-right text-gray-300 text-xs mt-1"></i>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────── Main Page Component ─────────────────────── */

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useAppToast();
  const [activeTab, setActiveTab] = useState('files');
  const [userMessage, setUserMessage] = useState(null);
  const [adminUploadScope, setAdminUploadScope] = useState({ selectedUserEmail: '', currentFolderId: null });
  const [createUserOpen, setCreateUserOpen] = useState(false);

  const { files: allFiles, loading: filesLoading, error: filesError } = useFirestoreFiles();
  const { folders: allFolders, loading: foldersLoading, refetch: refetchFolders } = useFolders();
  const folderActions = useFolderActions();
  const { users, loading: usersLoading, error: usersError, createUser, deleteUser, toggleAdmin, changePassword } = useAdminUsers();

  useEffect(() => {
    document.title = 'Admin Dashboard - DigiScribe';
  }, []);

  useEffect(() => {
    if (userMessage) {
      if (userMessage.type === 'success') {
        toast.success(userMessage.text);
        return;
      }
      toast.error(userMessage.text);
    }
  }, [userMessage, toast]);

  useEffect(() => {
    if (!usersError) return;
    toast.error(usersError, 'Unable to load users');
  }, [usersError, toast]);

  const handleCreateUser = async (data) => {
    setUserMessage(null);
    try {
      await createUser(data);
      setCreateUserOpen(false);
      const roleLabel = data.admin ? 'Admin' : 'User';
      const nameLabel = data.displayName ? ` (${data.displayName})` : '';
      setUserMessage({ type: 'success', text: `${roleLabel} "${data.email}"${nameLabel} created successfully.` });
    } catch (err) {
      setUserMessage({ type: 'error', text: err.message });
      throw err;
    }
  };

  const handleDeleteUser = async (uid, email) => {
    setUserMessage(null);
    try {
      await deleteUser(uid);
      setUserMessage({ type: 'success', text: `User "${email}" has been deleted.` });
    } catch (err) {
      setUserMessage({ type: 'error', text: err.message });
      throw err;
    }
  };

  const handleToggleAdmin = async (uid, isAdmin, email) => {
    setUserMessage(null);
    try {
      await toggleAdmin(uid, isAdmin);
      setUserMessage({
        type: 'success',
        text: isAdmin
          ? `Admin privileges granted to "${email}".`
          : `Admin privileges revoked from "${email}".`,
      });
    } catch (err) {
      setUserMessage({ type: 'error', text: err.message });
      throw err;
    }
  };

  const handleChangePassword = async (uid, email, password) => {
    setUserMessage(null);
    try {
      await changePassword(uid, password);
      setUserMessage({ type: 'success', text: `Password updated for "${email}".` });
    } catch (err) {
      setUserMessage({ type: 'error', text: err.message });
      throw err;
    }
  };

  const handleUploadClick = useCallback(() => {
    const params = new URLSearchParams();

    const selectedUserEmail = String(adminUploadScope.selectedUserEmail || '').trim();
    const currentFolderId = String(adminUploadScope.currentFolderId || '').trim();
    if (selectedUserEmail) params.set('targetOwnerEmail', selectedUserEmail);
    if (currentFolderId) params.set('folderId', currentFolderId);

    console.log('[admin/upload-click]', {
      selectedUserEmail,
      currentFolderId,
      targetUrl: params.toString() ? `/upload?${params.toString()}` : '/upload',
    });

    const query = params.toString();
    navigate(query ? `/upload?${query}` : '/upload');
  }, [adminUploadScope.currentFolderId, adminUploadScope.selectedUserEmail, navigate]);

  const heroContent = (
    <div className="relative z-10 py-10 pb-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold gradient-text">
              Admin Dashboard
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-sm text-gray-text">{user?.email || 'Admin'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            <div className="inline-flex bg-white rounded-xl shadow-sm border border-gray-100 p-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'btn-gradient text-white shadow-md shadow-primary/30'
                      : 'text-gray-text hover:text-dark-text hover:bg-gray-50'
                  }`}
                >
                  <i className={`fas ${tab.icon} text-xs`}></i>
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleUploadClick}
              className="btn-gradient text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all inline-flex items-center gap-2"
            >
              <i className="fas fa-plus text-xs"></i>
              {adminUploadScope.selectedUserEmail ? 'Upload File to this User' : 'Upload'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Layout heroContent={heroContent} hideFooter>
      <div className="min-h-screen bg-[#f8fafc]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {activeTab === 'files' && (
            <FilesTab
              allFiles={allFiles}
              allFolders={allFolders}
              filesLoading={filesLoading}
              filesError={filesError}
              foldersLoading={foldersLoading}
              folderActions={folderActions}
              refetchFolders={refetchFolders}
              onScopeChange={setAdminUploadScope}
            />
          )}
          {activeTab === 'users' && (
            <div className="space-y-6">
              <UserTable
                users={users}
                onDeleteUser={handleDeleteUser}
                onToggleAdmin={handleToggleAdmin}
                onChangePassword={handleChangePassword}
                loading={usersLoading}
                onOpenCreate={() => setCreateUserOpen(true)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Add New User Modal */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent className="max-w-md">
          <CreateUserForm
            onCreateUser={handleCreateUser}
            loading={usersLoading}
            onClose={() => setCreateUserOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

