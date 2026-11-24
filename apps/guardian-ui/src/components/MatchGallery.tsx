/**
 * Match Gallery Component
 * 
 * Displays a browsable gallery of potential matches
 * with filtering, timestamps, and export options.
 * 
 * @module components/MatchGallery
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  IconX,
  IconCheck,
  IconDownload,
  IconTrash,
  IconFilter,
  IconChevronLeft,
  IconChevronRight,
  IconExpand,
} from './icons';
import { lineState, sightingLines, sightingQuestion } from '../lib/lost-found-words';
import {
  getAllMatchFrames,
  getAllSubjectProfiles,
  getMatchFramesBySubject,
  acknowledgeMatchFrame,
  deleteMatchFrame,
  markMatchFramesExported,
  exportMatchFrames,
  type MatchFrameDB,
  type SubjectProfileDB,
} from '../lib/client-db';
import { useLostFoundStore } from '../stores/lost-found-store';

// =============================================================================
// Types
// =============================================================================

interface MatchGalleryProps {
  subjectId?: string;
  onClose?: () => void;
}

type FilterType = 'all' | 'unacknowledged' | 'high-confidence' | 'exported';
type SortType = 'newest' | 'oldest' | 'confidence';

// =============================================================================
// MatchGallery Component
// =============================================================================

export function MatchGallery({ subjectId, onClose }: MatchGalleryProps) {
  const [frames, setFrames] = useState<MatchFrameDB[]>([]);
  const [subjects, setSubjects] = useState<SubjectProfileDB[]>([]);
  const [filteredFrames, setFilteredFrames] = useState<MatchFrameDB[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortType>('newest');
  const [selectedFrame, setSelectedFrame] = useState<MatchFrameDB | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  
  const { settings } = useLostFoundStore();
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));
  const selectedName = selectedFrame && subjectMap.get(selectedFrame.subjectId)?.name;

  // Load frames
  const loadFrames = useCallback(async () => {
    setIsLoading(true);
    try {
      const [data, savedSubjects] = await Promise.all([
        subjectId ? getMatchFramesBySubject(subjectId) : getAllMatchFrames(),
        getAllSubjectProfiles(),
      ]);
      setFrames(data);
      setSubjects(savedSubjects);
    } catch (error) {
      console.error('Failed to load match frames:', error);
    } finally {
      setIsLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    loadFrames();
  }, [loadFrames]);

  // Apply filters and sorting
  useEffect(() => {
    let result = [...frames];
    
    // Filter
    switch (filter) {
      case 'unacknowledged':
        result = result.filter(f => !f.acknowledged);
        break;
      case 'high-confidence':
        result = result.filter(f => lineState(f.confidence, settings.minConfidenceForAlert) === 'over');
        break;
      case 'exported':
        result = result.filter(f => f.exported);
        break;
    }
    
    // Sort
    switch (sort) {
      case 'newest':
        result.sort((a, b) => b.timestamp - a.timestamp);
        break;
      case 'oldest':
        result.sort((a, b) => a.timestamp - b.timestamp);
        break;
      case 'confidence':
        result.sort((a, b) => b.confidence - a.confidence);
        break;
    }
    
    setFilteredFrames(result);
  }, [frames, filter, sort, settings.minConfidenceForAlert]);

  // Handle acknowledge
  const handleAcknowledge = async (id: string) => {
    await acknowledgeMatchFrame(id);
    setFrames(prev => prev.map(f => 
      f.id === id ? { ...f, acknowledged: true } : f
    ));
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    await deleteMatchFrame(id);
    setFrames(prev => prev.filter(f => f.id !== id));
    if (selectedFrame?.id === id) {
      setSelectedFrame(null);
    }
  };

  // Handle bulk acknowledge
  const handleBulkAcknowledge = async () => {
    for (const id of selectedIds) {
      await acknowledgeMatchFrame(id);
    }
    setFrames(prev => prev.map(f => 
      selectedIds.has(f.id) ? { ...f, acknowledged: true } : f
    ));
    setSelectedIds(new Set());
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    for (const id of selectedIds) {
      await deleteMatchFrame(id);
    }
    setFrames(prev => prev.filter(f => !selectedIds.has(f.id)));
    setSelectedIds(new Set());
  };

  // Handle export
  const handleExport = async (format: 'json' | 'csv') => {
    const idsToExport = selectedIds.size > 0 
      ? Array.from(selectedIds) 
      : frames.map(f => f.id);
    
    const { data, filename } = await exportMatchFrames(subjectId, format, idsToExport);
    
    // Download file
    const blob = new Blob([data], { type: format === 'csv' ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    
    // Mark as exported
    await markMatchFramesExported(idsToExport);
    setFrames(prev => prev.map(f => 
      idsToExport.includes(f.id) ? { ...f, exported: true } : f
    ));
  };

  // Toggle selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Select all visible
  const selectAll = () => {
    if (selectedIds.size === filteredFrames.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredFrames.map(f => f.id)));
    }
  };

  // Navigate in lightbox
  const navigateLightbox = (direction: 'prev' | 'next') => {
    if (!selectedFrame) return;
    
    const currentIndex = filteredFrames.findIndex(f => f.id === selectedFrame.id);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'prev'
      ? (currentIndex - 1 + filteredFrames.length) % filteredFrames.length
      : (currentIndex + 1) % filteredFrames.length;
    
    setSelectedFrame(filteredFrames[newIndex]);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-[var(--color-steel-600)] border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-steel-900)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[var(--color-steel-700)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            Saved pictures
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-[var(--color-steel-400)] hover:text-white transition-colors"
            >
              <IconX size={20} />
            </button>
          )}
        </div>
        
        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Filter button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${
              showFilters
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-[var(--color-steel-800)] text-[var(--color-steel-300)] hover:bg-[var(--color-steel-700)]'
            }`}
          >
            <IconFilter size={16} />
            Filter
          </button>
          
          {/* Sort dropdown */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortType)}
            className="px-3 py-1.5 bg-[var(--color-steel-800)] text-[var(--color-steel-300)] rounded-lg text-sm border-none focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="confidence">Closest first</option>
          </select>
          
          {/* Spacer */}
          <div className="flex-1" />
          
          {/* Selection actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-steel-400)]">
                {selectedIds.size} selected
              </span>
              <button
                onClick={handleBulkAcknowledge}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm"
              >
                Acknowledge
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm"
              >
                Delete
              </button>
            </div>
          )}
          
          {/* Export */}
          <div className="relative group">
            <button className="px-3 py-1.5 bg-[var(--color-steel-800)] text-[var(--color-steel-300)] hover:bg-[var(--color-steel-700)] rounded-lg text-sm flex items-center gap-2">
              <IconDownload size={16} />
              Export
            </button>
            <div className="absolute right-0 mt-1 w-32 bg-[var(--color-steel-800)] rounded-lg shadow-lg border border-[var(--color-steel-700)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <button
                onClick={() => handleExport('json')}
                className="w-full px-3 py-2 text-left text-sm text-[var(--color-steel-300)] hover:bg-[var(--color-steel-700)]"
              >
                Export JSON
              </button>
              <button
                onClick={() => handleExport('csv')}
                className="w-full px-3 py-2 text-left text-sm text-[var(--color-steel-300)] hover:bg-[var(--color-steel-700)]"
              >
                Export CSV
              </button>
            </div>
          </div>
        </div>
        
        {/* Filter options */}
        {showFilters && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--color-steel-700)]">
            {[
              { id: 'all', label: 'All' },
              { id: 'unacknowledged', label: 'New' },
              { id: 'high-confidence', label: 'Over the alert line' },
              { id: 'exported', label: 'Exported' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as FilterType)}
                className={`px-3 py-1 rounded-full text-xs transition-colors ${
                  filter === f.id
                    ? 'bg-emerald-500 text-white'
                    : 'bg-[var(--color-steel-800)] text-[var(--color-steel-400)] hover:bg-[var(--color-steel-700)]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Gallery grid */}
      {filteredFrames.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[var(--color-steel-400)]">
            {frames.length === 0 ? 'No pictures saved' : 'None of the saved pictures fit this filter'}
          </p>
        </div>
      ) : (
        <div className="p-4">
          {/* Select all checkbox */}
          <label className="flex items-center gap-2 mb-4 cursor-pointer text-sm text-[var(--color-steel-400)]">
            <input
              type="checkbox"
              checked={selectedIds.size === filteredFrames.length && filteredFrames.length > 0}
              onChange={selectAll}
              className="w-4 h-4 rounded accent-emerald-500"
            />
            Select all ({filteredFrames.length})
          </label>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredFrames.map((frame) => {
              const subject = subjectMap.get(frame.subjectId);
              
              return (
                <div
                  key={frame.id}
                  className={`relative group rounded-lg overflow-hidden border-2 transition-colors ${
                    selectedIds.has(frame.id)
                      ? 'border-emerald-500'
                      : 'border-transparent hover:border-[var(--color-steel-600)]'
                  }`}
                >
                  {/* Thumbnail */}
                  <div
                    className="aspect-video bg-[var(--color-steel-800)] cursor-pointer"
                    onClick={() => setSelectedFrame(frame)}
                  >
                    {frame.thumbnailData ? (
                      <img
                        src={frame.thumbnailData}
                        alt={`What the camera saw at ${new Date(frame.timestamp).toLocaleTimeString()}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[var(--color-steel-500)]">
                        No image
                      </div>
                    )}
                  </div>
                  
                  {/* Overlay info */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <div className="flex items-center justify-end">
                      <span className="text-xs text-[var(--color-steel-400)]">
                        {new Date(frame.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    {subject && (
                      <p className="text-xs text-white truncate mt-0.5">
                        {subject.name}
                      </p>
                    )}
                  </div>
                  
                  {/* Selection checkbox */}
                  <div className="absolute top-2 left-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(frame.id)}
                      onChange={() => toggleSelect(frame.id)}
                      className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  
                  {/* Status badges */}
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    {!frame.acknowledged && (
                      <span className="w-2 h-2 rounded-full bg-blue-500" title="New" />
                    )}
                    {frame.exported && (
                      <span className="w-2 h-2 rounded-full bg-green-500" title="Exported" />
                    )}
                  </div>
                  
                  {/* Hover actions */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFrame(frame);
                      }}
                      className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
                      aria-label="Open this picture"
                    >
                      <IconExpand size={16} className="text-white" aria-hidden="true" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAcknowledge(frame.id);
                      }}
                      className="p-2 bg-emerald-500/50 rounded-full hover:bg-emerald-500/70 transition-colors"
                      aria-label="Acknowledge this picture"
                    >
                      <IconCheck size={16} className="text-white" aria-hidden="true" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(frame.id);
                      }}
                      className="p-2 bg-red-500/50 rounded-full hover:bg-red-500/70 transition-colors"
                      aria-label="Delete this picture"
                    >
                      <IconTrash size={16} className="text-white" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Lightbox */}
      {selectedFrame && (
        <div
          className="fixed inset-0 bg-black/90 z-[110] flex items-center justify-center"
          onClick={() => setSelectedFrame(null)}
        >
          {/* Close button */}
          <button
            onClick={() => setSelectedFrame(null)}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors"
          >
            <IconX size={24} />
          </button>
          
          {/* Navigation */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigateLightbox('prev');
            }}
            className="absolute left-4 p-2 text-white/70 hover:text-white transition-colors"
          >
            <IconChevronLeft size={32} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigateLightbox('next');
            }}
            className="absolute right-4 p-2 text-white/70 hover:text-white transition-colors"
          >
            <IconChevronRight size={32} />
          </button>
          
          {/* Image and details */}
          <div
            className="max-w-4xl max-h-[90vh] w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[var(--color-steel-900)] rounded-xl overflow-hidden">
              {/* Image */}
              <div className="relative">
                {selectedFrame.frameData ? (
                  <img
                    src={selectedFrame.frameData}
                    alt={`What the camera saw at ${new Date(selectedFrame.timestamp).toLocaleTimeString()}`}
                    className="w-full max-h-[60vh] object-contain bg-black"
                  />
                ) : (
                  <div className="w-full h-64 flex items-center justify-center bg-[var(--color-steel-800)] text-[var(--color-steel-500)]">
                    No image available
                  </div>
                )}
                
                {/* Match region overlay */}
                {selectedFrame.region && selectedFrame.frameData && (
                  <div
                    className="absolute border-2 border-emerald-500 pointer-events-none"
                    style={{
                      left: `${(selectedFrame.region.x / 100)}%`,
                      top: `${(selectedFrame.region.y / 100)}%`,
                      width: `${selectedFrame.region.width}px`,
                      height: `${selectedFrame.region.height}px`,
                    }}
                  />
                )}
              </div>
              
              {/* Details */}
              <div className="p-4 space-y-4">
                <div>
                  <p className="text-lg font-semibold text-white">
                    {selectedName ? sightingQuestion(selectedName) : 'A possible sighting'}
                  </p>
                  {selectedName && (
                    <p className="text-sm text-[var(--color-steel-300)]">
                      {sightingLines(selectedName)[0]}
                    </p>
                  )}
                  <p className="text-sm text-[var(--color-steel-400)]">
                    {new Date(selectedFrame.timestamp).toLocaleString()}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-steel-700)]">
                  {!selectedFrame.acknowledged && (
                    <button
                      onClick={() => handleAcknowledge(selectedFrame.id)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
                    >
                      Acknowledge
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(selectedFrame.id)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MatchGallery;
