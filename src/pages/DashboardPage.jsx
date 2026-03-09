import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { fileUrl } from '../lib/fileUrl';
import Layout from '../components/layout/Layout';
import FileCard from '../components/dashboard/FileCard';
import FolderCard from '../components/dashboard/FolderCard';
import FolderRow from '../components/dashboard/FolderRow';
import Breadcrumbs from '../components/dashboard/Breadcrumbs';
import CreateFolderModal from '../components/dashboard/CreateFolderModal';
import MoveFolderModal from '../components/dashboard/MoveFolderModal';
import FilePreviewModal from '../components/dashboard/FilePreviewModal';
import FileNoteModal from '../components/dashboard/FileNoteModal';
import FilePropertiesModal from '../components/dashboard/FilePropertiesModal';
import FolderPropertiesModal from '../components/dashboard/FolderPropertiesModal';
import ContextMenu from '../components/dashboard/ContextMenu';
import DocumentViewerModal from '../components/dashboard/DocumentViewerModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import RenameDialog from '../components/ui/RenameDialog';
import { Button } from '../components/ui/button';
import { ServicePicker, SERVICE_TREE } from '../components/dashboard/FolderFilterToolbar';
import { useFirestoreFiles } from '../hooks/useFirestoreFiles';
import { useFolders } from '../hooks/useFolders';
import { useFolderActions } from '../hooks/useFolderActions';
import { useTranscriptions } from '../hooks/useTranscriptions';
import { useAppToast } from '../hooks/useAppToast';
import { useAuth } from '../contexts/AuthContext';

const STATUS_CONFIG = {
  pending: { label: 'Pending', icon: 'fa-clock', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', ring: 'ring-amber-400', iconBg: 'bg-amber-100' },
  'in-progress': { label: 'In Progress', icon: 'fa-arrows-rotate', bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-200', ring: 'ring-sky-400', iconBg: 'bg-sky-100' },
  transcribed: { label: 'Transcribed', icon: 'fa-check-circle', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', ring: 'ring-emerald-400', iconBg: 'bg-emerald-100' },
};

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name-asc', label: 'Name A-Z' },
  { value: 'name-desc', label: 'Name Z-A' },
  { value: 'size', label: 'Largest First' },
];

const USER_DASHBOARD_STATE_PREFIX = 'user-dashboard-state-v1';
const DASHBOARD_PAGE_SIZE = 12;

function getUserDashboardStateKey(userId) {
  return `${USER_DASHBOARD_STATE_PREFIX}:${userId}`;
}

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
  if (!sourceUrl) return null;
  return PLATFORM_MAP.find((p) => p.pattern.test(sourceUrl)) || null;
}

function getFileTypeDisplay(type) {
  if (!type) return '--';
  if (type.startsWith('image/')) return 'Image';
  if (type.startsWith('audio/')) return 'Audio';
  if (type.startsWith('video/')) return 'Video';
  if (type === 'application/pdf') return 'PDF';
  if (type === 'text/plain') return 'Text';
  if (type === 'text/csv') return 'CSV';
  if (type.includes('spreadsheet') || type.includes('excel')) return 'Excel';
  if (type.includes('word') || type === 'application/msword') return 'Word';
  if (type.includes('powerpoint') || type.includes('presentation')) return 'PowerPoint';
  return type;
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

export default function DashboardPage() {
  const { user, isAdmin, getIdToken } = useAuth();
  const toast = useAppToast();
  const [activeTab, setActiveTab] = useState('files');
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'list';
    const saved = window.localStorage.getItem('user-dashboard-view-mode');
    return saved === 'grid' ? 'grid' : 'list';
  });
  const [statusFilter, setStatusFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState([]);
  const [sortBy, setSortBy] = useState('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewFile, setPreviewFile] = useState(null);
  const [noteFile, setNoteFile] = useState(null);
  const [docViewerFile, setDocViewerFile] = useState(null);
  const [propertiesFile, setPropertiesFile] = useState(null);
  const [propertiesFolder, setPropertiesFolder] = useState(null);
  const [message, setMessage] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(null);
  const [downloadLoadingKey, setDownloadLoadingKey] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const dashboardStateHydratedRef = useRef(false);
  const lastAnchorId = useRef(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMoveActive, setBulkMoveActive] = useState(false); // bulk move to folder

  // Context menu state
  const [contextMenu, setContextMenu] = useState(null);

  // Folder state
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [moveTarget, setMoveTarget] = useState(null); // { type: 'file'|'folder', item }
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragOverFolder, setDragOverFolder] = useState(null);
  const [deleteFolderConfirm, setDeleteFolderConfirm] = useState(null);
  const [isDraggingAny, setIsDraggingAny] = useState(false);
  const [renameFolderModal, setRenameFolderModal] = useState(null);

  const { files: allFiles, loading, error } = useFirestoreFiles();
  const { folders: allFolders, loading: foldersLoading, refetch: refetchFolders } = useFolders();
  const { createFolder, renameFolder, moveFolder, deleteFolder, moveFileToFolder } = useFolderActions();
  const { transcriptions, loading: transLoading, error: transError, fetchTranscriptions } = useTranscriptions();

  useEffect(() => {
    if (!message) return;
    if (message.type === 'success') {
      toast.success(message.text);
      return;
    }
    toast.error(message.text);
  }, [message, toast]);

  useEffect(() => {
    if (!error) return;
    toast.error(error, 'Unable to load files');
  }, [error, toast]);

  useEffect(() => {
    if (!transError) return;
    toast.error(transError, 'Unable to load transcriptions');
  }, [transError, toast]);

  useEffect(() => {
    document.title = 'Dashboard - DigiScribe Transcription Corp.';
  }, []);

  useEffect(() => {
    if (activeTab === 'transcriptions') {
      fetchTranscriptions();
    }
  }, [activeTab, fetchTranscriptions]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('user-dashboard-view-mode', viewMode);
    }
  }, [viewMode]);

  useEffect(() => {
    dashboardStateHydratedRef.current = false;
  }, [user?.uid]);

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.uid || dashboardStateHydratedRef.current) return;
    dashboardStateHydratedRef.current = true;

    try {
      const raw = window.localStorage.getItem(getUserDashboardStateKey(user.uid));
      if (!raw) return;
      const state = JSON.parse(raw);
      if (!state || typeof state !== 'object') return;

      if (state.viewMode === 'grid' || state.viewMode === 'list') setViewMode(state.viewMode);
      if (typeof state.statusFilter === 'string') setStatusFilter(state.statusFilter);
      if (Array.isArray(state.serviceFilter)) setServiceFilter(state.serviceFilter);
      if (typeof state.sortBy === 'string') setSortBy(state.sortBy);
      if (typeof state.searchQuery === 'string') setSearchQuery(state.searchQuery);
      if (typeof state.currentFolderId === 'string' || state.currentFolderId === null) setCurrentFolderId(state.currentFolderId ?? null);
      if (Number.isInteger(state.currentPage) && state.currentPage > 0) setCurrentPage(state.currentPage);
    } catch {
      // Ignore malformed cache entries
    }
  }, [user?.uid]);

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.uid || !dashboardStateHydratedRef.current) return;
    const state = {
      viewMode,
      statusFilter,
      serviceFilter,
      sortBy,
      searchQuery,
      currentFolderId,
      currentPage,
      updatedAt: Date.now(),
    };
    try {
      window.localStorage.setItem(getUserDashboardStateKey(user.uid), JSON.stringify(state));
    } catch {
      // Ignore storage quota/private mode errors
    }
  }, [user?.uid, viewMode, statusFilter, serviceFilter, sortBy, searchQuery, currentFolderId, currentPage]);

  // id → name lookup for all folders (used for "inside folder" badge)
  const folderMap = useMemo(() => {
    const m = {};
    for (const f of allFolders) m[f.id] = f.name || 'Unnamed folder';
    return m;
  }, [allFolders]);

  // Reset currentFolderId if it points to a folder that no longer exists
  useEffect(() => {
    if (foldersLoading || !allFolders) return;
    if (currentFolderId && allFolders.length >= 0) {
      const exists = allFolders.some((f) => f.id === currentFolderId);
      if (!exists) setCurrentFolderId(null);
    }
  }, [foldersLoading, allFolders, currentFolderId]);

  // Files the user owns that are in folders they can't see (moved to an admin-only folder)
  const hiddenFiles = useMemo(() => {
    // Don't flag while folders are still loading — avoids false positives
    if (foldersLoading) return [];
    const visibleFolderIds = new Set(allFolders.map((f) => f.id));
    return allFiles.filter((f) => f.folderId && !visibleFolderIds.has(f.folderId));
  }, [allFiles, allFolders, foldersLoading]);

  const [hiddenFilesExpanded, setHiddenFilesExpanded] = useState(false);

  // Compute counts scoped to current folder for status tabs; total is always all files
  const counts = useMemo(() => {
    const insideFolder = currentFolderId !== null;
    const scopedFiles = insideFolder
      ? allFiles.filter((f) => (f.folderId || null) === currentFolderId)
      : allFiles;
    const result = { total: allFiles.length, pending: 0, 'in-progress': 0, transcribed: 0 };
    for (const file of scopedFiles) {
      if (result[file.status] !== undefined) result[file.status]++;
    }
    return result;
  }, [allFiles, allFolders, currentFolderId]);

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

  // Files in current folder (or all files when searching/filtering at root)
  const currentFolderFiles = useMemo(() => {
    // When inside a folder, always scope – never expand regardless of active filters
    if (currentFolderId !== null) {
      return allFiles.filter((f) => (f.folderId || null) === currentFolderId);
    }
    // At root: expand to all files when searching/filtering so results cross folders
    if (searchQuery.trim() || statusFilter || serviceFilter.length > 0) return allFiles;
    return allFiles.filter((f) => (f.folderId || null) === null);
  }, [allFiles, currentFolderId, searchQuery, statusFilter, serviceFilter]);

  // Subfolders – hidden while a status/service filter is active (those views are file-only)
  const currentSubfolders = useMemo(() => {
    if (statusFilter || serviceFilter.length > 0) return [];
    let folders = allFolders
      .filter((f) => (f.parentId || null) === currentFolderId);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      folders = folders.filter((f) => f.name && f.name.toLowerCase().includes(q));
    }
    return folders;
  }, [allFolders, currentFolderId, searchQuery, statusFilter, serviceFilter]);

  // Count items per folder (files + subfolders)
  const folderItemCounts = useMemo(() => {
    const counts = {};
    for (const f of allFiles) {
      const fid = f.folderId || null;
      if (fid) counts[fid] = (counts[fid] || 0) + 1;
    }
    for (const f of allFolders) {
      const pid = f.parentId || null;
      if (pid) counts[pid] = (counts[pid] || 0) + 1;
    }
    return counts;
  }, [allFiles, allFolders]);

  // Total file sizes per folder (direct files)
  const folderSizes = useMemo(() => {
    const sizes = {};
    for (const f of allFiles) {
      const fid = f.folderId || null;
      if (fid && f.size > 0) sizes[fid] = (sizes[fid] || 0) + f.size;
    }
    return sizes;
  }, [allFiles]);

  // Filter + sort (applies on current folder files)
  const filteredFiles = useMemo(() => {
    let result = [...currentFolderFiles];

    if (statusFilter) result = result.filter((f) => f.status === statusFilter);
    if (serviceFilter.length > 0) {
      result = result.filter((f) => {
        if (!f.serviceCategory) return false;
        return serviceFilter.some((sf) => {
          if (sf.includes(' - ')) return f.serviceCategory === sf;
          return f.serviceCategory === sf || f.serviceCategory.startsWith(`${sf} - `);
        });
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((f) =>
        f.originalName && f.originalName.toLowerCase().includes(q)
      );
    }

    switch (sortBy) {
      case 'oldest': result.sort((a, b) => new Date(a.uploadedAt || 0) - new Date(b.uploadedAt || 0)); break;
      case 'name-asc': result.sort((a, b) => (a.originalName || '').localeCompare(b.originalName || '')); break;
      case 'name-desc': result.sort((a, b) => (b.originalName || '').localeCompare(a.originalName || '')); break;
      case 'size': result.sort((a, b) => (b.size || 0) - (a.size || 0)); break;
      default: result.sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0)); break;
    }
    return result;
  }, [currentFolderFiles, statusFilter, serviceFilter, searchQuery, sortBy]);

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
  const totalFilePages = Math.max(1, Math.ceil(allPageItems.length / DASHBOARD_PAGE_SIZE));
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * DASHBOARD_PAGE_SIZE;
    return allPageItems.slice(startIndex, startIndex + DASHBOARD_PAGE_SIZE);
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
  }, [statusFilter, serviceFilter, searchQuery, sortBy, currentFolderId]);

  const handleStatusChange = useCallback(async (fileId, newStatus) => {
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/files/metadata/${fileId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update status.');
    } catch (err) {
      toast.error(err.message, 'Status update failed');
    }
  }, [getIdToken, toast]);

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
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setDeleteLoading(null);
      setDeleteConfirm(null);
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
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to update note.');
    }
    setPreviewFile((prev) => (prev && prev.id === fileId ? { ...prev, description: data.description ?? description } : prev));
  }, [getIdToken]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter, serviceFilter, searchQuery, sortBy, currentFolderId]);

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
  const selectedCount = selectedFileCount + selectedFolderCount;

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
        // Shift+click does not move the anchor
        return;
      }
      // Ctrl/Meta+click or plain toggle — always updates anchor
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

  // Keyboard shortcuts (Ctrl+A, Escape, Delete, Ctrl+I)
  useEffect(() => {
    const handler = (e) => {
      if (activeTab !== 'files') return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+A — toggle select all on page
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

      // Ctrl+I — invert selection on current page
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

      // Escape — deselect all
      if (e.key === 'Escape') {
        setSelectedIds(new Set());
        lastAnchorId.current = null;
        return;
      }

      // Delete — bulk delete if items are selected
      if (e.key === 'Delete' && selectedCount > 0) {
        e.preventDefault();
        setBulkDeleteConfirm(true);
        return;
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [activeTab, allPageIds, selectedCount]);

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
  }, [selectedFileIds, selectedFolderIds, getIdToken, moveFolder]);

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

  // Bulk download as zip
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
      let deletedFiles = 0;
      let deletedFolders = 0;
      let skippedFolders = 0;

      if (selectedFileIds.length > 0) {
        const token = await getIdToken();
        const res = await fetch('/api/files/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ fileIds: selectedFileIds }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Bulk delete failed.');
        deletedFiles = Number(data.deleted || 0);
      }

      for (const folderId of selectedFolderIds) {
        try {
          await deleteFolder(folderId);
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
  }, [selectedFileIds, selectedFolderIds, getIdToken, deleteFolder]);

  // Copy file URL to clipboard
  const copyFileUrl = useCallback((file) => {
    const url = fileUrl(file.url);
    navigator.clipboard.writeText(url).then(
      () => { setMessage({ type: 'success', text: 'URL copied to clipboard.' }); setTimeout(() => setMessage(null), 2000); },
      () => { setMessage({ type: 'error', text: 'Failed to copy URL.' }); }
    );
  }, []);

  const getDownloadUrl = useCallback((url) => {
    const resolved = fileUrl(url);
    if (!resolved) return resolved;
    return resolved.includes('?') ? `${resolved}&download=1` : `${resolved}?download=1`;
  }, []);

  const triggerDownload = useCallback((rawUrl, fileName, key) => {
    const resolved = getDownloadUrl(rawUrl);
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
  }, [getDownloadUrl]);

  // Folder actions
  const handleCreateFolder = useCallback(async (name, parentId) => {
    await createFolder(name, parentId);
    await refetchFolders();
    setMessage({ type: 'success', text: `Folder "${name}" created.` });
    setTimeout(() => setMessage(null), 3000);
  }, [createFolder, refetchFolders]);

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

  const handleDeleteFolder = useCallback(async (folderId) => {
    try {
      await deleteFolder(folderId);
      await refetchFolders();
      setMessage({ type: 'success', text: 'Folder and its contents deleted.' });
      setTimeout(() => setMessage(null), 3000);
      // If we're inside the deleted folder, navigate to parent
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

  // Move modal handler
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

  // Get descendant folder IDs (for excluding from move targets)
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

  // Right-click handler for files
  const handleFileContextMenu = useCallback((e, file) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, file, type: 'file' });
  }, []);

  // Right-click handler for folders
  const handleFolderContextMenu = useCallback((e, folder) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, folder, type: 'folder' });
  }, []);

  // Right-click handler for attached transcription sub-rows
  const handleTranscriptionContextMenu = useCallback((e, file) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, file, type: 'transcription' });
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
        { icon: 'fa-pencil-alt', label: 'Rename', onClick: () => setRenameFolderModal({ id: folder.id, name: folder.name || '' }) },
        { icon: 'fa-arrows-alt', label: 'Move to...', onClick: () => setMoveTarget({ type: 'folder', item: folder }) },
        { icon: 'fa-info-circle', label: 'Properties', onClick: () => setPropertiesFolder(folder) },
        { divider: true },
        { icon: 'fa-trash-alt', label: 'Delete Folder', danger: true, onClick: () => setDeleteFolderConfirm(folder.id) },
      ];
    }

    if (contextMenu.type === 'transcription') {
      const file = contextMenu.file;
      return [
        { icon: 'fa-eye', label: 'View Transcription', onClick: () => setDocViewerFile({ url: file.transcriptionUrl, name: file.transcriptionName || 'Transcription', type: file.transcriptionType, size: file.transcriptionSize }) },
        { icon: 'fa-download', label: 'Download Transcription', onClick: () => triggerDownload(file.transcriptionUrl, file.transcriptionName || 'Transcription', `trans-${file.id}`) },
        { divider: true },
        { icon: 'fa-link', label: 'Copy Link', onClick: () => { navigator.clipboard.writeText(window.location.origin + file.transcriptionUrl).catch(() => {}); } },
      ];
    }

    const file = contextMenu.file;
    const isUrl = file.sourceType === 'url';
    const sourceHref = file.sourceUrl || file.sourceReferenceUrl || (isUrl ? file.url : '');
    const hasNote = !!(file.description && file.description.trim().length > 0);
    const items = [];

    const selCount = [...selectedIds].filter((id) => filteredIds.has(id)).length;

    if (selCount <= 1) {
      items.push({ icon: 'fa-check-square', label: selectedIds.has(file.id) ? 'Deselect' : 'Select', onClick: () => toggleSelect(file.id) });
      items.push({ divider: true });
      items.push({ icon: 'fa-eye', label: 'Preview', onClick: () => setPreviewFile(file) });
      items.push({ icon: 'fa-sticky-note', label: 'View Note', disabled: !hasNote, onClick: () => setNoteFile(file) });
      if (isUrl && sourceHref) {
        items.push({
          icon: 'fa-up-right-from-square',
          label: 'Open Source Link',
          onClick: () => window.open(sourceHref, '_blank', 'noopener,noreferrer'),
        });
      }

      // Users can only download when a transcription has been attached by admin
      if (file.transcriptionUrl) {
        items.push({
          icon: 'fa-eye',
          label: 'View Transcription',
          onClick: () => setDocViewerFile({ url: file.transcriptionUrl, name: file.transcriptionName || 'Transcription', type: file.transcriptionType, size: file.transcriptionSize }),
        });
        items.push({
          icon: 'fa-download',
          label: 'Download Transcription',
          onClick: () => triggerDownload(file.transcriptionUrl, file.transcriptionName || file.originalName, `trans-${file.id}`),
        });
      }
      items.push({ divider: true });
      items.push({ icon: 'fa-folder-open', label: 'Move to Folder...', onClick: () => setMoveTarget({ type: 'file', item: file }) });
      items.push({ divider: true });
      items.push({ icon: 'fa-info-circle', label: 'Properties', onClick: () => setPropertiesFile(file) });
      items.push({ icon: 'fa-trash-alt', label: 'Delete', danger: true, onClick: () => setDeleteConfirm(file.id) });
    }

    if (selCount > 1) {
      items.push({ icon: 'fa-check-square', label: selectedIds.has(file.id) ? 'Deselect' : 'Select', onClick: () => toggleSelect(file.id) });
      items.push({ divider: true });
      items.push({ icon: 'fa-arrows-alt', label: 'Move Selected', onClick: () => setBulkMoveActive(true) });
      items.push({ icon: 'fa-times-circle', label: 'Deselect All', onClick: () => setSelectedIds(new Set()) });
      items.push({ icon: 'fa-trash-alt', label: 'Delete Selected', danger: true, onClick: () => setBulkDeleteConfirm(true) });
    }

    return items;
  }, [contextMenu, selectedIds, filteredIds, handleBulkDownload, handleFolderDownload, triggerDownload]);

  const clearFilters = () => {
    setStatusFilter('');
    setServiceFilter([]);
    setSearchQuery('');
  };

  const hasActiveFilters = statusFilter || serviceFilter.length > 0 || searchQuery;
  const isSearching = searchQuery.trim().length > 0;
  const totalItems = currentSubfolders.length + filteredFiles.length;

  const heroContent = (
    <div className="relative z-10 py-10 pb-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold gradient-text">
              Dashboard
            </h1>
            <p className="text-sm text-gray-text mt-1">
              Welcome back, {user?.email?.split('@')[0] || 'User'}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setShowCreateFolder(true)}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-dark-text hover:bg-gray-50 transition-all duration-300 inline-flex items-center gap-2"
            >
              <i className="fas fa-folder-plus text-xs text-indigo-500"></i>
              New Folder
            </button>
            <Link
              to={currentFolderId ? `/upload?folderId=${currentFolderId}` : '/upload'}
              className="btn-gradient text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-300 inline-flex items-center gap-2"
            >
              <i className="fas fa-plus text-xs"></i>
              New Upload
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Layout heroContent={heroContent} hideFooter>
      <div className="min-h-screen bg-[#f8fafc]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

          {activeTab === 'files' ? (
            <>
              {/* Stats Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <button
                  onClick={() => { setStatusFilter(''); }}
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
                    onClick={() => setStatusFilter((prev) => prev === key ? '' : key)}
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

              {/* "Moved to admin folder" notice */}
              {hiddenFiles.length > 0 && (
                <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setHiddenFilesExpanded((v) => !v)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-amber-100/50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <i className="fas fa-folder-minus text-amber-500 text-sm"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-amber-700">
                        {hiddenFiles.length} file{hiddenFiles.length !== 1 ? 's' : ''} moved to a restricted folder
                      </p>
                      <p className="text-[11px] text-amber-600/80 mt-0.5">
                        An admin moved {hiddenFiles.length === 1 ? 'this file' : 'these files'} to a folder you don’t have access to. {hiddenFiles.length === 1 ? 'It’ still' : 'They’re still'} tracked in your status counts above.
                      </p>
                    </div>
                    <i className={`fas fa-chevron-down text-amber-400 text-xs transition-transform flex-shrink-0 ${hiddenFilesExpanded ? 'rotate-180' : ''}`}></i>
                  </button>
                  {hiddenFilesExpanded && (
                    <div className="border-t border-amber-200 px-4 pb-3 pt-2 space-y-2">
                      {hiddenFiles.map((file) => {
                        const cfg = STATUS_CONFIG[file.status] || STATUS_CONFIG.pending;
                        return (
                          <div key={file.id} className="flex items-center gap-3 py-1.5">
                            <i className="fas fa-file text-amber-300 text-xs flex-shrink-0 w-4 text-center"></i>
                            <span className="text-sm text-amber-800 truncate flex-1" title={file.originalName}>
                              {file.originalName}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border} flex-shrink-0`}>
                              <i className={`fas ${cfg.icon} text-[8px]`}></i>
                              {cfg.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Filter Bar */}
              <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6 shadow-sm">
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
                    {isSearching && (
                      <span className="text-xs text-gray-400 ml-1">
                        Searching across all folders &middot; {filteredFiles.length} result{filteredFiles.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {!isSearching && (statusFilter || serviceFilter.length > 0) && (
                      <span className="text-xs text-gray-400 ml-1">
                        Showing across all folders &middot; {filteredFiles.length} result{filteredFiles.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {!isSearching && !statusFilter && serviceFilter.length === 0 && (
                      <span className="text-xs text-gray-400 ml-1">
                        {filteredFiles.length} result{filteredFiles.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Breadcrumbs */}
              <Breadcrumbs
                folders={allFolders}
                currentFolderId={currentFolderId}
                onNavigate={setCurrentFolderId}
                onDrop={handleDrop}
                isDraggingAny={isDraggingAny}
              />

              {/* Bulk action bar */}
              {selectedCount > 0 && (
                <div className="bg-white rounded-xl border border-primary/20 p-3 mb-6 shadow-sm flex items-center gap-3 flex-wrap">
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
                      Delete All
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

              {/* Select All bar */}
              {(filteredFiles.length > 0 || currentSubfolders.length > 0) && (
                <div className="flex items-center gap-3 mb-4">
                  <Button
                    onClick={toggleSelectAll}
                    variant="outline"
                    size="sm"
                    className="gap-2 text-xs text-gray-text hover:text-dark-text hover:bg-white"
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
                  </Button>
                  <span className="text-xs text-gray-400">
                    {currentSubfolders.length > 0 && `${currentSubfolders.length} folder${currentSubfolders.length !== 1 ? 's' : ''}, `}
                    {filteredFiles.length} file{filteredFiles.length !== 1 ? 's' : ''}
                  </span>
                </div>
              )}

              {/* Content */}
              {loading || foldersLoading ? (
                <div className="text-center py-24">
                  <i className="fas fa-spinner fa-spin text-3xl text-primary mb-4 block"></i>
                  <p className="text-sm text-gray-text">Loading your files...</p>
                </div>
              ) : totalItems === 0 && !hasActiveFilters ? (
                <div className="text-center py-24 bg-white rounded-2xl border border-gray-100">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className={`fas ${currentFolderId ? 'fa-folder-open' : 'fa-cloud-upload-alt'} text-primary text-xl`}></i>
                  </div>
                  <p className="text-sm font-medium text-dark-text">
                    {currentFolderId ? 'This folder is empty' : 'No files uploaded yet'}
                  </p>
                  <p className="text-xs text-gray-text mt-1 mb-5">
                    {currentFolderId
                      ? 'Drag files here or upload new ones.'
                      : 'Upload your first file to get started.'}
                  </p>
                  <div className="flex items-center gap-3 justify-center">
                    <button
                      onClick={() => setShowCreateFolder(true)}
                      className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                    >
                      <i className="fas fa-folder-plus text-xs"></i>
                      Create Folder
                    </button>
                    <Link
                      to={currentFolderId ? `/upload?folderId=${currentFolderId}` : '/upload'}
                      className="inline-flex items-center gap-2 btn-gradient text-white px-6 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all"
                    >
                      <i className="fas fa-plus text-xs"></i>
                      Upload Files
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
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px]">
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
                          <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-text uppercase tracking-wider">Date</th>
                          <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-text uppercase tracking-wider">Size</th>
                          <th className="text-center px-4 py-3 text-[11px] font-semibold text-gray-text uppercase tracking-wider w-36">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {paginatedFolders.map((folder) => {
                          if (renamingFolder === folder.id) {
                            return (
                              <tr key={folder.id} className="bg-primary/[0.03]">
                                <td colSpan={7} className="px-4 py-3">
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
                              showUploadedBy={false}
                              onDelete={(id) => setDeleteFolderConfirm(id)}
                            />
                          );
                        })}

                        {paginatedFiles.map((file) => {
                          const cfg = STATUS_CONFIG[file.status] || STATUS_CONFIG.pending;
                          const isSelected = selectedIds.has(file.id);
                          const isUrl = file.sourceType === 'url';
                          const urlPlatform = isUrl ? getUrlPlatform(file.sourceUrl || file.sourceReferenceUrl || file.url) : null;
                          const fileIconClass = urlPlatform ? urlPlatform.icon : `fas ${getFileIcon(file.type)}`;
                          const fileIconColor = urlPlatform ? urlPlatform.color : getFileIconColor(file.type);
                          return (
                            <React.Fragment key={file.id}>
                            <tr
                              className={`transition-colors cursor-pointer ${isSelected ? 'bg-primary/[0.03]' : 'hover:bg-gray-50/50'}`}
                              draggable
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
                                    <span
                                      className="text-sm font-medium text-dark-text truncate block max-w-[280px] cursor-pointer hover:text-primary transition-colors"
                                      title={file.originalName}
                                      onClick={() => setPreviewFile(file)}
                                    >
                                      {file.originalName}
                                    </span>
                                    {file.serviceCategory && (
                                      <span className="text-[10px] text-indigo-500">{file.serviceCategory}</span>
                                    )}
                                    {statusFilter && currentFolderId === null && file.folderId && (
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
                                {isUrl ? (
                                  <span className="text-xs text-gray-text">{urlPlatform?.label || 'URL'}</span>
                                ) : (
                                  <span className="text-xs text-gray-text">
                                    {getFileTypeDisplay(file.type)}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3.5">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                  <i className={`fas ${cfg.icon} text-[9px]`}></i>
                                  {cfg.label}
                                </span>
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
                                    className="gap-1 text-[11px] font-medium text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                    title="Delete file"
                                  >
                                    {deleteLoading === file.id ? (
                                      <i className="fas fa-spinner fa-spin text-[10px]"></i>
                                    ) : (
                                      <i className="fas fa-trash-alt text-[10px]"></i>
                                    )}
                                    Delete
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            {/* Transcription sub-row */}
                            {file.transcriptionUrl && (
                              <tr className="bg-emerald-50/30" onContextMenu={(e) => handleTranscriptionContextMenu(e, file)}>
                                <td className="px-3 py-2"></td>
                                <td className="px-4 py-2" colSpan={3}>
                                  <div className="flex items-center gap-2.5 pl-11">
                                    <span className="text-gray-300 text-xs select-none">└─</span>
                                    <div className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center flex-shrink-0">
                                      <i className="fas fa-file-circle-check text-emerald-500 text-[10px]"></i>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setDocViewerFile({ url: file.transcriptionUrl, name: file.transcriptionName || 'Transcription', type: file.transcriptionType, size: file.transcriptionSize })}
                                      className="text-[12px] font-medium text-dark-text truncate max-w-[220px] hover:text-primary transition-colors text-left"
                                      title={file.transcriptionName}
                                    >
                                      {file.transcriptionName || 'Transcription'}
                                    </button>
                                  </div>
                                </td>
                                <td className="px-4 py-2">
                                  <span className="text-[11px] text-gray-text">{file.transcriptionAttachedAt ? formatRelativeDate(typeof file.transcriptionAttachedAt === 'object' && file.transcriptionAttachedAt.toDate ? file.transcriptionAttachedAt.toDate().toISOString() : file.transcriptionAttachedAt) : '--'}</span>
                                </td>
                                <td className="px-4 py-2">
                                  <span className="text-[11px] text-gray-text">{file.transcriptionSize > 0 ? formatSize(file.transcriptionSize) : '--'}</span>
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => setDocViewerFile({ url: file.transcriptionUrl, name: file.transcriptionName || 'Transcription', type: file.transcriptionType, size: file.transcriptionSize })}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
                                      title="View transcription"
                                    >
                                      <i className="fas fa-eye text-[10px]"></i>
                                      View
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => triggerDownload(file.transcriptionUrl, file.transcriptionName || file.originalName, `trans-${file.id}`)}
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
                </div>
              ) : (
                <div
                  className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
                  onDragOver={(e) => {
                    // Allow drop on the grid background (move to current folder)
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
                  {/* Folders first */}
                  {paginatedFolders.map((folder) => {
                    // Inline rename
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
                        onDelete={(id) => setDeleteFolderConfirm(id)}
                      />
                    );
                  })}

                  {/* Then files */}
                  {paginatedFiles.map((file) => {
                    const isSelected = selectedIds.has(file.id);
                    return (
                      <div
                        key={file.id}
                        className="transition-all"
                        draggable
                        onDragStart={(e) => handleDragStart(e, file, 'file')}
                        onContextMenu={(e) => handleFileContextMenu(e, file)}
                      >
                        <FileCard
                          file={file}
                          isAdmin={isAdmin}
                          onStatusChange={handleStatusChange}
                          onPreview={setPreviewFile}
                          isSelected={isSelected}
                          onSelect={handleSelectClick}
                          onDelete={(id) => setDeleteConfirm(id)}
                          deleteLoading={deleteLoading === file.id}
                          folderName={statusFilter && currentFolderId === null && file.folderId ? (folderMap[file.folderId] || 'folder') : ''}
                          onOpenFolder={statusFilter && currentFolderId === null && file.folderId ? () => setCurrentFolderId(file.folderId) : undefined}
                          onViewTranscription={file.transcriptionUrl ? (f) => setDocViewerFile({ url: f.transcriptionUrl, name: f.transcriptionName || 'Transcription', type: f.transcriptionType, size: f.transcriptionSize }) : undefined}
                          onDownloadTranscription={file.transcriptionUrl ? (f) => triggerDownload(f.transcriptionUrl, f.transcriptionName || f.originalName, `trans-${f.id}`) : undefined}
                          transcriptionDownloadLoading={downloadLoadingKey === `trans-${file.id}`}
                        />
                      </div>
                    );
                  })}
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
            </>
          ) : (
            /* Transcriptions Tab */
            <>
              {transLoading ? (
                <div className="text-center py-24">
                  <i className="fas fa-spinner fa-spin text-3xl text-primary mb-4 block"></i>
                  <p className="text-sm text-gray-text">Loading transcriptions...</p>
                </div>
              ) : transcriptions.length === 0 ? (
                <div className="text-center py-24 bg-white rounded-2xl border border-gray-100">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-file-lines text-primary text-xl"></i>
                  </div>
                  <p className="text-sm font-medium text-dark-text">No transcriptions yet</p>
                  <p className="text-xs text-gray-text mt-1">
                    When your uploaded files are transcribed, they will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {transcriptions.map((t) => (
                    <Link
                      key={t.id}
                      to={`/transcriptions/${t.id}`}
                      className="block bg-white rounded-xl border border-gray-100 p-5 hover:border-gray-200 hover:shadow-md transition-all duration-200"
                    >
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          t.deliveryType === 'file' ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-600'
                        }`}>
                          <i className={`fas ${t.deliveryType === 'file' ? 'fa-file-audio' : 'fa-file-alt'} text-sm`}></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-dark-text truncate">
                            {t.title || t.fileName || 'Untitled Transcription'}
                          </h3>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                            {t.fileName && (
                              <span className="text-[11px] text-gray-400 flex items-center gap-1">
                                <i className="fas fa-paperclip text-[9px]"></i>
                                {t.fileName}
                              </span>
                            )}
                            <span className="text-[11px] text-gray-400 flex items-center gap-1">
                              <i className="fas fa-clock text-[9px]"></i>
                              {t.createdAt ? (() => { const d = new Date(t.createdAt); return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`; })() : '--'}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              t.deliveryType === 'file' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                            }`}>
                              <i className={`fas ${t.deliveryType === 'file' ? 'fa-download' : 'fa-align-left'} text-[8px]`}></i>
                              {t.deliveryType === 'file' ? 'File' : 'Text'}
                            </span>
                          </div>
                          {t.deliveryType === 'text' && t.content && (
                            <p className="text-xs text-gray-400 mt-2 line-clamp-2 leading-relaxed">
                              {t.content}
                            </p>
                          )}
                        </div>
                        <div className="flex-shrink-0 text-gray-300">
                          <i className="fas fa-chevron-right text-xs"></i>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}

        </div>
      </div>

      {/* Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          canEditDescription={!isAdmin}
          onSaveDescription={handleUpdateDescription}
        />
      )}

      {noteFile && (
        <FileNoteModal
          file={noteFile}
          onClose={() => setNoteFile(null)}
        />
      )}

      {/* Document Viewer Modal (transcription view) */}
      {docViewerFile && (
        <DocumentViewerModal
          file={docViewerFile}
          onClose={() => setDocViewerFile(null)}
        />
      )}

      {/* Properties Modals */}
      {propertiesFile && (
        <FilePropertiesModal file={propertiesFile} onClose={() => setPropertiesFile(null)} />
      )}
      {propertiesFolder && (
        <FolderPropertiesModal
          folder={propertiesFolder}
          itemCount={folderItemCounts[propertiesFolder.id] || 0}
          totalSize={folderSizes[propertiesFolder.id] || 0}
          onClose={() => setPropertiesFolder(null)}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Create Folder Modal */}
      <CreateFolderModal
        isOpen={showCreateFolder}
        onClose={() => setShowCreateFolder(false)}
        onCreateFolder={handleCreateFolder}
        parentFolderId={currentFolderId}
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

      <RenameDialog
        open={!!renameFolderModal}
        title="Rename Folder"
        description="Enter a new folder name."
        initialValue={renameFolderModal?.name || ''}
        confirmLabel="Save"
        onConfirm={async (newName) => {
          if (!renameFolderModal?.id || !newName.trim()) return;
          await handleRenameFolder(renameFolderModal.id, newName.trim());
          setRenameFolderModal(null);
        }}
        onClose={() => setRenameFolderModal(null)}
      />
    </Layout>
  );
}
