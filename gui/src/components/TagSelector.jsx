import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * TagSelector - type-to-search tag picker.
 *
 * Selected items render as removable chips. An inline input filters the
 * available options as you type. Dropdown appears on focus/typing.
 *
 * Props:
 *   items       - string[] or { value, label }[]
 *   selected    - string (single) or string[] (multi) of selected values
 *   onChange    - callback with new value(s)
 *   multi       - allow multiple selections (default false)
 *   placeholder - ghost text when nothing typed
 *   label       - optional label above the input
 *   allowCreate - allow typing a value not in the list (default false)
 */
export default function TagSelector({
  items = [],
  selected,
  onChange,
  multi = false,
  placeholder = 'Type to search...',
  label,
  allowCreate = false,
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  // Normalize items
  const normalized = items.map((item) =>
    typeof item === 'string' ? { value: item, label: item } : item
  );

  // Selected as array
  const selectedArr = multi ? (selected || []) : selected ? [selected] : [];

  // Filter: exclude already-selected, match search
  const filtered = normalized.filter(
    (item) =>
      !selectedArr.includes(item.value) &&
      item.label.toLowerCase().includes(search.toLowerCase())
  );

  // Close on outside click
  useEffect(() => {
    function handle(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const pick = (value) => {
    if (multi) {
      onChange([...selectedArr, value]);
    } else {
      onChange(value);
    }
    setSearch('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const remove = (value) => {
    if (multi) {
      onChange(selectedArr.filter((v) => v !== value));
    } else {
      onChange('');
    }
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Backspace' && !search && selectedArr.length > 0) {
      remove(selectedArr[selectedArr.length - 1]);
    }
    if (e.key === 'Enter' && search) {
      e.preventDefault();
      if (filtered.length > 0) {
        pick(filtered[0].value);
      } else if (allowCreate && search.trim()) {
        pick(search.trim());
      }
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setSearch('');
    }
  };

  const getLabel = (value) => {
    const item = normalized.find((i) => i.value === value);
    return item ? item.label : value;
  };

  return (
    <div ref={wrapperRef} className="relative">
      {label && (
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      )}

      {/* Tag chips + inline search input */}
      <div
        className={`flex flex-wrap items-center gap-1 border rounded-lg px-2 py-1.5 cursor-text transition-colors min-h-[34px] ${
          open ? 'border-blue-400 ring-2 ring-blue-100 dark:ring-blue-900' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
        }`}
        onClick={() => inputRef.current?.focus()}
      >
        {selectedArr.map((val) => (
          <span
            key={val}
            className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium pl-2 pr-1 py-0.5 rounded"
          >
            {getLabel(val)}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); remove(val); }}
              className="text-blue-400 hover:text-blue-600 rounded-full"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="flex-1 min-w-[60px] text-sm outline-none bg-transparent py-0.5"
          placeholder={selectedArr.length === 0 ? placeholder : ''}
        />
        {selectedArr.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (multi) onChange([]);
              else onChange('');
            }}
            className="text-gray-300 hover:text-gray-500 flex-shrink-0 ml-auto"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (filtered.length > 0 || (allowCreate && search.trim())) && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg dark:shadow-gray-950/50 overflow-hidden">
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((item) => (
              <button
                key={item.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(item.value)}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300"
              >
                {item.label}
              </button>
            ))}
            {filtered.length === 0 && allowCreate && search.trim() && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(search.trim())}
                className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-blue-50"
              >
                Create "{search.trim()}"
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
