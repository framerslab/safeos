/**
 * Match Gallery Component
 * 
 * Displays a browsable gallery of potential matches
 * with filtering, timestamps, and export options.
 * 
 * @module components/MatchGallery
 */

'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  getSavedSightingPictures,
  getAllSubjectProfiles,
  acknowledgeMatchFrame,
  deleteMatchFrame,
  markMatchFramesExported,
  exportMatchFrames,
  updateCachedAlert,
  type KeptSightingPicture,
  type MatchFrameDB,
  type SubjectProfileDB,
} from '../lib/client-db';
import { closeUpName } from '../lib/alert-pictures/words';
import { deletePicture, usePicture } from '../lib/alert-pictures/keeper';
import { onTabMessage } from '../lib/tab-channel';
import { Moment } from './alert-pictures/PictureBlock';
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

type SavedPicture = MatchFrameDB | KeptSightingPicture;

function isSighting(frame: SavedPicture): frame is KeptSightingPicture {
  return 'alertId' in frame;
}

function SightingPicture({ picture, opened = false }: { picture: KeptSightingPicture; opened?: boolean }) {
  const view = usePicture(picture.id);
  if (view.status !== 'shown') return null;
  const { set, frameUrl, closeUpUrl } = view;
  const aspect = Math.max(4 / 3, set.frameWidth / set.frameHeight);
  const width = opened ? `min(100%, ${48 * aspect}vh)` : `${Math.min(1, aspect * 9 / 16) * 100}%`;
  return (
    <>
      <div className={opened ? 'flex justify-center bg-black' : 'flex h-full items-center justify-center'}>
        <div style={{ width }}>
          <Moment set={set} url={frameUrl} at={picture.timestamp} className="alert-picture__frame" />
        </div>
      </div>
      {opened && closeUpUrl && (
        <img
          src={closeUpUrl}
          alt={closeUpName(picture.timestamp)}
          className="mx-auto my-3 max-h-32 max-w-full object-contain"
        />
      )}
    </>
  );
}


// =============================================================================
// MatchGallery Component
// =============================================================================

export function MatchGallery({ subjectId, onClose }: MatchGalleryProps) {
  const [frames, setFrames] = useState<SavedPicture[]>([]);
  const [subjects, setSubjects] = useState<SubjectProfileDB[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortType>('newest');
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const read = useRef(0);

  const { settings } = useLostFoundStore();
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));
  const nameOf = (frame: SavedPicture) => (isSighting(frame) ? frame.subjectName : undefined)
    ?? subjectMap.get(frame.subjectId)?.name;
  const selectedFrame = frames.find((frame) => frame.id === openedId);
  const selectedName = selectedFrame && nameOf(selectedFrame);
  const title = selectedName ? sightingQuestion(selectedName) : 'A possible sighting';

  const loadFrames = useCallback(async () => {
    const turn = ++read.current;
    try {
      const [data, savedSubjects] = await Promise.all([
        getSavedSightingPictures(subjectId),
        getAllSubjectProfiles(),
      ]);
      if (turn !== read.current) return;
      setFrames(data);
      setSubjects(savedSubjects);
      const ids = new Set(data.map((frame) => frame.id));
      setSelectedIds((previous) => new Set([...previous].filter((id) => ids.has(id))));
      setOpenedId((id) => id && ids.has(id) ? id : null);
    } catch (error) {
      console.error('Failed to load saved pictures:', error);
    } finally {
      if (turn === read.current) setIsLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    void loadFrames();
    const stop = onTabMessage((message) => {
      if (message.type === 'alerts-changed' || (message.type === 'pictures' && message.news.type !== 'settings')) {
        void loadFrames();
      }
    });
    return () => {
      read.current += 1;
      stop();
    };
  }, [loadFrames]);

  const filteredFrames = useMemo(() => {
    const result = frames.filter((frame) => {
      switch (filter) {
        case 'unacknowledged': return !frame.acknowledged;
        case 'high-confidence':
          return isSighting(frame) || lineState(frame.confidence, settings.minConfidenceForAlert) === 'over';
        case 'exported': return frame.exported;
        default: return true;
      }
    });

    return result.sort((a, b) => {
      if (sort === 'oldest') return a.timestamp - b.timestamp;
      if (sort === 'confidence') {
        // A kept sighting already raised an alert and has no comparison score of its own.
        const score = (frame: SavedPicture) => isSighting(frame) ? -Infinity : frame.confidence;
        if (score(a) !== score(b)) return score(b) - score(a);
      }
      return b.timestamp - a.timestamp;
    });
  }, [frames, filter, sort, settings.minConfidenceForAlert]);

  const acknowledge = (frame: SavedPicture) => isSighting(frame)
    ? updateCachedAlert({ id: frame.alertId, acknowledged: true, acknowledgedAt: new Date().toISOString() })
    : acknowledgeMatchFrame(frame.id);

  const remove = (frame: SavedPicture) => isSighting(frame)
    ? deletePicture(frame.id, { kind: 'sighting', takenAt: frame.timestamp })
    : deleteMatchFrame(frame.id);

  const handleAcknowledge = async (frame: SavedPicture) => {
    await acknowledge(frame);
    await loadFrames();
  };

  const handleDelete = async (frame: SavedPicture) => {
    await remove(frame);
    await loadFrames();
  };

  const selection = () => frames.filter((frame) => selectedIds.has(frame.id));

  const handleBulkAcknowledge = async () => {
    for (const frame of selection()) await acknowledge(frame);
    setSelectedIds(new Set());
    await loadFrames();
  };

  const handleBulkDelete = async () => {
    for (const frame of selection()) await remove(frame);
    setSelectedIds(new Set());
    await loadFrames();
  };

  const handleExport = async (format: 'json' | 'csv') => {
    const chosen = selectedIds.size > 0 ? selection() : frames;
    const earlier = chosen.filter((frame) => !isSighting(frame)).map((frame) => frame.id);
    const sightings = chosen.filter(isSighting);
    const { data, filename } = await exportMatchFrames(subjectId, format, earlier, sightings);

    const blob = new Blob([data], { type: format === 'csv' ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    await Promise.all([
      markMatchFramesExported(earlier),
      ...sightings.map((frame) => updateCachedAlert({ id: frame.alertId, exportedPictureId: frame.id })),
    ]);
    await loadFrames();
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
    
    setOpenedId(filteredFrames[newIndex].id);
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
              const name = nameOf(frame);
              
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
                    onClick={() => setOpenedId(frame.id)}
                  >
                    {isSighting(frame) ? (
                      <SightingPicture picture={frame} />
                    ) : frame.thumbnailData ? (
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
                    {name && (
                      <p className="text-xs text-[#f4f5f6] truncate mt-0.5">
                        {isSighting(frame) ? sightingQuestion(name) : name}
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
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenedId(frame.id);
                      }}
                      className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
                      aria-label="Open this picture"
                    >
                      <IconExpand size={16} className="text-white" aria-hidden="true" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAcknowledge(frame);
                      }}
                      className="p-2 bg-emerald-500/50 rounded-full hover:bg-emerald-500/70 transition-colors"
                      aria-label="Acknowledge this picture"
                    >
                      <IconCheck size={16} className="text-white" aria-hidden="true" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(frame);
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
          role="dialog"
          aria-label={title}
          onClick={() => setOpenedId(null)}
        >
          {/* Close button */}
          <button
            onClick={() => setOpenedId(null)}
            aria-label="Close"
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
            className="max-w-4xl max-h-[90vh] w-full mx-4 overflow-y-auto rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[var(--color-steel-900)] rounded-xl overflow-hidden">
              {/* Image */}
              <div className="relative">
                {isSighting(selectedFrame) ? (
                  <SightingPicture picture={selectedFrame} opened />
                ) : selectedFrame.frameData ? (
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
                {!isSighting(selectedFrame) && selectedFrame.region && selectedFrame.frameData && (
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
                    {title}
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
                      onClick={() => handleAcknowledge(selectedFrame)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
                    >
                      Acknowledge
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(selectedFrame)}
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
