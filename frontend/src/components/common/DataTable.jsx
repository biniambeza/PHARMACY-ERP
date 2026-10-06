import React, { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';

/**
 * DataTable - Reusable enterprise ERP table with search, filter tabs, pagination, and empty states
 */
const DataTable = ({
  title,
  subtitle,
  columns = [],
  data = [],
  searchPlaceholder = 'Search records...',
  searchKeys = [],
  filterOptions = [], // e.g. [{ label: 'All', value: 'all' }, { label: 'Active', value: 'active' }]
  activeFilter = 'all',
  onFilterChange,
  filterKey = 'status',
  pageSize = 6,
  renderRow,
  headerAction,
  emptyIcon = null,
  emptyMessage = 'No records found',
  emptySubtext = 'Try adjusting your search or filter parameters',
}) => {
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Filter & Search Logic
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      // Status/Category Filter
      if (activeFilter && activeFilter !== 'all' && filterKey) {
        if (item[filterKey] !== activeFilter) return false;
      }

      // Search Filter
      if (!search.trim()) return true;
      const q = search.toLowerCase();

      if (searchKeys.length > 0) {
        return searchKeys.some((k) => {
          const val = k.split('.').reduce((obj, key) => obj?.[key], item);
          return String(val || '').toLowerCase().includes(q);
        });
      }

      // Fallback: search across all string values
      return Object.values(item).some((v) =>
        typeof v === 'object'
          ? JSON.stringify(v).toLowerCase().includes(q)
          : String(v || '').toLowerCase().includes(q)
      );
    });
  }, [data, search, activeFilter, filterKey, searchKeys]);

  // Pagination Logic
  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  return (
    <div className="bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100/90 dark:border-slate-800/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5 sm:p-6 transition-colors">
      {/* Table Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-100 dark:border-slate-800/80">
        <div>
          {title && (
            <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search Bar */}
          {searchPlaceholder && (
            <div className="relative min-w-[200px] sm:min-w-[240px]">
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          )}

          {/* Filter Pills */}
          {filterOptions && filterOptions.length > 0 && (
            <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium">
              {filterOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    onFilterChange?.(opt.value);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer text-[11px] ${
                    activeFilter === opt.value
                      ? 'bg-white dark:bg-[#161c26] text-teal-600 dark:text-teal-400 font-bold shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Custom Header Action button */}
          {headerAction}
        </div>
      </div>

      {/* Table Body */}
      <div className="overflow-x-auto">
        {paginatedData.length === 0 ? (
          <div className="py-12 text-center">
            {emptyIcon ? (
              <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto text-xl mb-3 shadow-2xs">
                {emptyIcon}
              </div>
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto mb-3 border border-slate-100 dark:border-slate-800">
                <Inbox className="w-6 h-6 text-slate-400" />
              </div>
            )}
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {emptyMessage}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              {emptySubtext}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase tracking-wider font-semibold text-[11px]">
                {columns.map((col, idx) => (
                  <th
                    key={idx}
                    className={`pb-3 ${col.className || ''} ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60 font-medium">
              {paginatedData.map((item, idx) =>
                renderRow ? (
                  renderRow(item, idx)
                ) : (
                  <tr
                    key={item._id || idx}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition"
                  >
                    {columns.map((col, cIdx) => (
                      <td
                        key={cIdx}
                        className={`py-3.5 ${col.className || ''} ${
                          col.align === 'right' ? 'text-right' : 'text-left'
                        }`}
                      >
                        {col.render ? col.render(item) : item[col.key]}
                      </td>
                    ))}
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      {filteredData.length > pageSize && (
        <div className="flex items-center justify-between pt-4 mt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400">
          <span>
            Showing {(currentPage - 1) * pageSize + 1} to{' '}
            {Math.min(currentPage * pageSize, filteredData.length)} of{' '}
            {filteredData.length} records
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable;
