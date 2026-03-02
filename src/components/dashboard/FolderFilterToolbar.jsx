import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import DateRangePicker from './DateRangePicker';

/* ── Service hierarchy — subs MUST match UploadPage children exactly ─ */
export const SERVICE_TREE = [
  {
    key: 'transcription',
    label: 'Transcription Support',
    icon: 'fa-microphone-alt',
    subs: ['Medical', 'Legal', 'General', 'Academic', 'Corporate/Business'],
  },
  {
    key: 'data-entry',
    label: 'Data Entry',
    icon: 'fa-keyboard',
    subs: ['Waybill/Invoice/Charge', 'Batch Proof Report'],
  },
  {
    key: 'emr',
    label: 'EMR',
    icon: 'fa-notes-medical',
    subs: ['Data Entry & Digitalization', 'Data Migration', 'EMR Management'],
  },
  {
    key: 'document-conversion',
    label: 'Document Conversion',
    icon: 'fa-file-export',
    subs: ['OCR & Data Extraction', 'File Format Conversion', 'Book and Ebook Conversion', 'Indexing & Redaction'],
  },
  {
    key: 'cad',
    label: 'CAD',
    icon: 'fa-drafting-compass',
    subs: ['Architectural Drafting', 'Structural Drafting', 'MEP & HVAC', '3D Visualization'],
  },
  {
    key: 'product-listing',
    label: 'E-commerce Product Listing',
    icon: 'fa-shopping-cart',
    subs: ['Data Cleaning & Validation', 'Data Extraction'],
  },
];

/* ── ServicePicker ───────────────────────────────────────────────── */
export function ServicePicker({ value = [], onChange }) {
  // value is an array of strings (parent labels like "EMR" or sub labels like "EMR - Data Migration")
  const visibleTree = SERVICE_TREE.map((cat) => ({ ...cat, visibleSubs: cat.subs }));

  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState(() => visibleTree[0]?.key || '');
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const panelWidth = 480;
    let left = rect.left;
    if (left + panelWidth > window.innerWidth - 8) left = window.innerWidth - panelWidth - 8;
    setPos({ top: rect.bottom + 6, left });
  }, []);

  // Position before first paint when opened to avoid top-left flash.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    updatePos();
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [open]);

  // ── Helpers ──────────────────────────────────────────────────────
  const isParentSelected = (cat) => value.includes(cat.label);
  const hasAnySubSelected = (cat) => cat.subs.some((sub) => value.includes(`${cat.label} - ${sub}`));
  const isSubChecked = (cat, sub) => value.includes(`${cat.label} - ${sub}`) || value.includes(cat.label);

  const toggleParent = (cat) => {
    if (value.includes(cat.label)) {
      // Remove parent selection entirely
      onChange(value.filter((v) => v !== cat.label));
    } else {
      // Add parent; remove any individual sub entries for this parent (redundant)
      onChange([...value.filter((v) => !v.startsWith(`${cat.label} - `)), cat.label]);
    }
  };

  const toggleSub = (cat, sub) => {
    const fullVal = `${cat.label} - ${sub}`;
    if (value.includes(cat.label)) {
      // Parent broadly selected → clicking a sub means "exclude this one"
      // Result: remove parent, add all other subs
      const otherSubs = cat.subs.filter((s) => s !== sub).map((s) => `${cat.label} - ${s}`);
      onChange([...value.filter((v) => v !== cat.label), ...otherSubs]);
    } else if (value.includes(fullVal)) {
      onChange(value.filter((v) => v !== fullVal));
    } else {
      onChange([...value, fullVal]);
    }
  };

  const toggleSelectAll = (cat) => {
    const parentIn = value.includes(cat.label);
    const allSubsIn = cat.subs.every((sub) => value.includes(`${cat.label} - ${sub}`));
    if (parentIn || allSubsIn) {
      // Deselect everything for this category
      onChange(value.filter((v) => v !== cat.label && !v.startsWith(`${cat.label} - `)));
    } else {
      // Select all via parent label (most efficient)
      onChange([...value.filter((v) => !v.startsWith(`${cat.label} - `)), cat.label]);
    }
  };

  const activeCategory = visibleTree.find((c) => c.key === activeKey) || visibleTree[0];
  const isActive = value.length > 0;

  // Button label + icon
  const buttonLabel = (() => {
    if (!isActive) return 'All Services';
    if (value.length === 1) {
      const v = value[0];
      return v.includes(' - ') ? v.split(' - ').slice(1).join(' - ') : v;
    }
    return `${value.length} Selected`;
  })();

  const triggerIcon = (() => {
    if (!isActive) return 'fa-concierge-bell';
    const firstVal = value[0];
    const parentLabel = firstVal.includes(' - ') ? firstVal.split(' - ')[0] : firstVal;
    const found = SERVICE_TREE.find((c) => c.label === parentLabel);
    return found ? found.icon : 'fa-concierge-bell';
  })();

  if (visibleTree.length === 0) return null;

  const panel = open && pos ? createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: 480 }}
      className="bg-white rounded-2xl shadow-xl border border-gray-100 flex overflow-hidden"
    >
      {/* Left – parent categories */}
      <div className="w-[175px] border-r border-gray-100 bg-gray-50/60 py-3 flex flex-col gap-0.5">
        <p className="px-4 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          Service Group
        </p>
        <button
          type="button"
          onClick={() => { onChange([]); setOpen(false); }}
          className={`mx-2 text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            !isActive ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
          }`}
        >
          <i className="fas fa-layer-group mr-1.5 text-[10px]"></i>
          All Services
        </button>
        <div className="h-px bg-gray-200 mx-3 my-1" />
        {visibleTree.map((cat) => {
          const isCurrent = cat.key === activeKey;
          const broadly = isParentSelected(cat);
          const hasSub = hasAnySubSelected(cat);
          const hasAny = broadly || hasSub;
          return (
            <button
              key={cat.key}
              type="button"
              onMouseEnter={() => { if (cat.subs.length > 0) setActiveKey(cat.key); }}
              onClick={() => {
                toggleParent(cat);
                if (cat.subs.length > 0) setActiveKey(cat.key);
              }}
              className={`mx-2 text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
                broadly
                  ? 'bg-primary/10 text-primary border border-primary/30'
                  : isCurrent
                    ? 'bg-white shadow-sm border border-gray-200/80 text-dark-text'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
              }`}
            >
              <i className={`fas ${cat.icon} text-[10px] ${hasAny ? 'text-primary' : 'text-gray-400'}`}></i>
              <span className="leading-tight">{cat.label}</span>
              {hasAny && (
                broadly
                  ? <i className="fas fa-check ml-auto text-[9px] text-primary flex-shrink-0"></i>
                  : <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0"></span>
              )}
            </button>
          );
        })}
      </div>

      {/* Right – sub-services */}
      <div className="flex-1 p-4">
        {activeCategory && activeCategory.visibleSubs.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <i className={`fas ${activeCategory.icon} text-primary text-xs`}></i>
                <p className="text-xs font-semibold text-gray-700">{activeCategory.label}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleSelectAll(activeCategory)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all border ${
                  isParentSelected(activeCategory) || activeCategory.subs.every((s) => value.includes(`${activeCategory.label} - ${s}`))
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                {isParentSelected(activeCategory) || activeCategory.subs.every((s) => value.includes(`${activeCategory.label} - ${s}`))
                  ? <><i className="fas fa-check mr-1 text-[8px]"></i>All Selected</>
                  : 'Select All'}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {activeCategory.visibleSubs.map((sub) => {
                const checked = isSubChecked(activeCategory, sub);
                const broadly = isParentSelected(activeCategory);
                return (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => toggleSub(activeCategory, sub)}
                    className={`text-left px-3 py-2.5 rounded-xl text-xs font-medium transition-all border flex items-center gap-2 ${
                      checked
                        ? broadly
                          ? 'bg-primary/5 border-primary/20 text-primary/80'
                          : 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100 hover:border-gray-300'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                      checked ? 'bg-primary border-primary' : 'border-gray-300 bg-white'
                    }`}>
                      {checked && <i className="fas fa-check text-white" style={{ fontSize: '7px' }}></i>}
                    </span>
                    {sub}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!open) updatePos();
          setOpen((o) => !o);
        }}
        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all whitespace-nowrap ${
          isActive
            ? 'bg-primary/5 border-primary/30 text-primary'
            : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
        }`}
      >
        <i className={`fas ${triggerIcon} text-xs`}></i>
        <span className="max-w-[160px] truncate">{buttonLabel}</span>
        {isActive && (
          <span
            className="ml-1 w-4 h-4 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0"
            onClick={(e) => { e.stopPropagation(); onChange([]); }}
            title="Clear"
          >
            <i className="fas fa-times" style={{ fontSize: '7px' }}></i>
          </span>
        )}
        <i className={`fas fa-chevron-down text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}></i>
      </button>
      {panel}
    </div>
  );
}

/* ── Static file type options ────────────────────────────────────── */
const ALL_FILE_TYPES = ['Image', 'Audio', 'Video', 'Document'];

/* ── Sort options ────────────────────────────────────────────────── */
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name-asc', label: 'Name A-Z' },
  { value: 'name-desc', label: 'Name Z-A' },
  { value: 'size', label: 'Largest First' },
];

/* ── FolderFilterToolbar ─────────────────────────────────────────── */
export default function FolderFilterToolbar({
  dateFrom,
  dateTo,
  onDateChange,
  typeFilter,
  onTypeChange,
  serviceFilter,
  onServiceChange,
  searchQuery,
  onSearchChange,
  fileTypes = [],
  serviceCategories = [],
  sortBy,
  onSortChange,
  onClear,
  hasActiveFilters,
  userFilter = '',
  onUserChange,
  userEmails = [],
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Compute user suggestions from searchQuery
  const userSuggestions = useMemo(() => {
    if (!searchQuery.trim() || !userEmails.length || !onUserChange) return [];
    const q = searchQuery.toLowerCase().trim();
    return userEmails.filter((email) => email.toLowerCase().includes(q)).slice(0, 6);
  }, [searchQuery, userEmails, onUserChange]);

  // Close suggestions on outside click
  useEffect(() => {
    if (!showSuggestions) return;
    const handler = (e) => {
      if (
        searchRef.current && !searchRef.current.contains(e.target) &&
        suggestionsRef.current && !suggestionsRef.current.contains(e.target)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSuggestions]);

  const handleSearchChange = (val) => {
    onSearchChange(val);
    setShowSuggestions(true);
  };

  const handleSelectUser = (email) => {
    if (onUserChange) onUserChange(email);
    onSearchChange('');
    setShowSuggestions(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
      <div className="flex flex-col lg:flex-row gap-3 flex-wrap">

        {/* Search – LEFT, takes remaining space */}
        <div className="relative flex-1 min-w-[200px]" ref={searchRef}>
          <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 text-sm"></i>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            placeholder={onUserChange ? 'Search by file name or user email...' : 'Search by file name...'}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-dark-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
          />
          {searchQuery && (
            <button onClick={() => { onSearchChange(''); setShowSuggestions(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <i className="fas fa-times text-xs"></i>
            </button>
          )}

          {/* User suggestion dropdown */}
          {showSuggestions && userSuggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden"
            >
              <p className="px-3 pt-2.5 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Users</p>
              {userSuggestions.map((email) => (
                <button
                  key={email}
                  type="button"
                  onClick={() => handleSelectUser(email)}
                  className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 hover:bg-primary/5 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-user text-[10px] text-indigo-400"></i>
                  </div>
                  <span className="text-sm text-dark-text truncate">{email}</span>
                  <span className="ml-auto text-[10px] text-gray-400">Filter by user</span>
                </button>
              ))}
            </div>
          )}

          {/* Active user filter badge below search */}
          {userFilter && (
            <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <i className="fas fa-user text-[9px]"></i>
              {userFilter}
              <button onClick={() => onUserChange('')} className="hover:opacity-70 ml-0.5"><i className="fas fa-times text-[8px]"></i></button>
            </div>
          )}
        </div>

        {/* Date range picker */}
        <DateRangePicker from={dateFrom} to={dateTo} onChange={onDateChange} />

        {/* Service picker – portal popup panel */}
        <ServicePicker value={serviceFilter} onChange={onServiceChange} />

        {/* Type filter */}
        <div className="relative">
          <select
            value={typeFilter}
            onChange={(e) => onTypeChange(e.target.value)}
            className="appearance-none pl-4 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-dark-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all min-w-[140px]"
          >
            <option value="">All Types</option>
            {ALL_FILE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <i className="fas fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none"></i>
        </div>

        {/* Sort */}
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className="appearance-none pl-4 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-dark-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all min-w-[150px]"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <i className="fas fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none"></i>
        </div>

        {/* Clear all */}
        {hasActiveFilters && (
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-gray-text hover:text-dark-text hover:bg-gray-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <i className="fas fa-times text-xs"></i>
            Clear
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-400">Filters:</span>
          {dateFrom && dateTo && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-primary/10 text-primary">
              <i className="fas fa-calendar-alt text-[9px]"></i>
              {dateFrom.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {dateTo.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              <button onClick={() => onDateChange(null, null)} className="hover:opacity-70 ml-0.5"><i className="fas fa-times text-[8px]"></i></button>
            </span>
          )}
          {serviceFilter && serviceFilter.length > 0 && serviceFilter.map((sf) => {
            const parentLabel = sf.includes(' - ') ? sf.split(' - ')[0] : sf;
            const subLabel = sf.includes(' - ') ? sf.split(' - ').slice(1).join(' - ') : null;
            const catIcon = SERVICE_TREE.find((c) => c.label === parentLabel)?.icon || 'fa-concierge-bell';
            return (
              <span key={sf} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-600">
                <i className={`fas ${catIcon} text-[9px]`}></i>
                <span>{subLabel ? `${parentLabel} › ${subLabel}` : parentLabel}</span>
                <button onClick={() => onServiceChange(serviceFilter.filter((v) => v !== sf))} className="hover:opacity-70 ml-0.5"><i className="fas fa-times text-[8px]"></i></button>
              </span>
            );
          })}
          {typeFilter && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-violet-50 text-violet-600">
              <i className="fas fa-file text-[9px]"></i>
              {typeFilter}
              <button onClick={() => onTypeChange('')} className="hover:opacity-70 ml-0.5"><i className="fas fa-times text-[8px]"></i></button>
            </span>
          )}
          {searchQuery && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">
              &quot;{searchQuery}&quot;
              <button onClick={() => onSearchChange('')} className="hover:opacity-70 ml-0.5"><i className="fas fa-times text-[8px]"></i></button>
            </span>
          )}
          {userFilter && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700">
              <i className="fas fa-user text-[9px]"></i>
              {userFilter}
              <button onClick={() => onUserChange('')} className="hover:opacity-70 ml-0.5"><i className="fas fa-times text-[8px]"></i></button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
