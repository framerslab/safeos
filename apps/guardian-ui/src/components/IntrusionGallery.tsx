'use client';

/**
 * Intrusion Gallery Component
 * 
 * Displays captured intrusion frames with timestamps, person counts,
 * and export/delete functionality.
 * 
 * @module components/IntrusionGallery
 */

import { useState, useEffect, useCallback } from 'react';
import {
  IconTrash,
  IconDownload,
  IconCheck,
  IconX,
  IconChevronLeft,
  IconChevronRight,
  IconAlertTriangle,
  IconClock,
} from './icons';
import { moreThanWatchAllows, peopleInView, peopleAtTime } from '../lib/alert-pictures/words';
import {
  getAllIntrusionFrames,
  deleteIntrusionFrame,
  acknowledgeIntrusionFrame,
  exportIntrusionFrames,
  getIntrusionStats,
  type IntrusionFrameDB,
} from '../lib/client-db';
import { useSecurityStore } from '../stores/security-store';

// =============================================================================
// Types
// =============================================================================

interface IntrusionStats {
  totalIntrusions: number;
  unacknowledged: number;
  last24Hours: number;
  last7Days: number;
  averagePersonCount: number;
}

// =============================================================================
// Sub-Components
// =============================================================================

interface FrameCardProps {
  frame: IntrusionFrameDB;
  isSelected: boolean;
  onSelect: () => void;
  onAcknowledge: () => void;
  onDelete: () => void;
  onView: () => void;
}

function FrameCard({
  frame,
  isSelected,
  onSelect,
  onAcknowledge,
  onDelete,
  onView,
}: FrameCardProps) {
  const overLimit = frame.personCount > frame.allowedCount;
  const timeAgo = getTimeAgo(frame.timestamp);

  return (
    <div
      className={`relative group rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
        isSelected
          ? 'border-emerald-500 ring-2 ring-emerald-500/50'
          : frame.acknowledged
          ? 'border-slate-700 opacity-75'
          : 'border-red-500/50 hover:border-red-400'
      }`}
      onClick={onView}
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-slate-800 relative">
        {frame.thumbnailData ? (
          <img
            src={frame.thumbnailData}
            alt={peopleAtTime(frame.personCount, frame.timestamp)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600">
            <IconAlertTriangle size={32} />
          </div>
        )}

        {/* Selection checkbox */}
        <div
          className="absolute bottom-2 left-2"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          <div
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              isSelected
                ? 'bg-emerald-500 border-emerald-500'
                : 'bg-slate-800/80 border-slate-500 hover:border-emerald-400'
            }`}
          >
            {isSelected && <IconCheck size={14} className="text-white" />}
          </div>
        </div>

        {/* Acknowledged indicator */}
        {frame.acknowledged && (
          <div className="absolute bottom-2 right-2 p-1 bg-slate-800/80 rounded">
            <IconCheck size={14} className="text-emerald-400" />
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="p-2 bg-slate-800">
        <p className="text-sm font-semibold text-white">{peopleInView(frame.personCount)}</p>
        {overLimit && <p className="text-sm text-slate-300">{moreThanWatchAllows}</p>}
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 flex items-center gap-1">
            <IconClock size={12} />
            {timeAgo}
          </span>
          <div className="flex gap-1">
            {!frame.acknowledged && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAcknowledge();
                }}
                className="p-1 text-emerald-400 hover:text-emerald-300"
                aria-label="Acknowledge"
              >
                <IconCheck size={14} aria-hidden="true" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 text-red-400 hover:text-red-300"
              aria-label="Delete"
            >
              <IconTrash size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface FrameViewerProps {
  frame: IntrusionFrameDB;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
}

function FrameViewer({
  frame,
  onClose,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: FrameViewerProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl w-full bg-slate-900 rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">{peopleInView(frame.personCount)}</h3>
            <p className="text-sm text-slate-400">
              {new Date(frame.timestamp).toLocaleString()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white"
          >
            <IconX size={24} />
          </button>
        </div>

        {/* Image */}
        <div className="relative aspect-video bg-black">
          {frame.frameData ? (
            <img
              src={frame.frameData}
              alt="Camera picture"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-600">
              <IconAlertTriangle size={64} />
            </div>
          )}

          {/* Navigation buttons */}
          {hasPrevious && (
            <button
              onClick={onPrevious}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 rounded-full text-white hover:bg-black/70"
            >
              <IconChevronLeft size={24} />
            </button>
          )}
          {hasNext && (
            <button
              onClick={onNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 rounded-full text-white hover:bg-black/70"
            >
              <IconChevronRight size={24} />
            </button>
          )}

          {/* Detection boxes overlay */}
          {frame.detections.map((detection, index) => {
            const [x, y, width, height] = detection.bbox;
            return (
              <div
                key={index}
                className="absolute border-2 border-red-500"
                style={{
                  left: `${(x / 320) * 100}%`,
                  top: `${(y / 240) * 100}%`,
                  width: `${(width / 320) * 100}%`,
                  height: `${(height / 240) * 100}%`,
                }}
              />
            );
          })}
        </div>

        {/* Details */}
        <div className="p-4 grid grid-cols-3 gap-4 border-t border-slate-700">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-400">
              {frame.personCount}
            </div>
            <div className="text-xs text-slate-500">People in view</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-300">
              {frame.allowedCount}
            </div>
            <div className="text-xs text-slate-500">Allowed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-400">
              +{Math.max(0, frame.personCount - frame.allowedCount)}
            </div>
            <div className="text-xs text-slate-500">Excess</div>
          </div>
        </div>

        {/* Notes */}
        {frame.notes && (
          <div className="px-4 pb-4">
            <div className="p-3 bg-slate-800 rounded text-sm text-slate-300">
              {frame.notes}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface StatsBarProps {
  stats: IntrusionStats;
}

function StatsBar({ stats }: StatsBarProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
        <div className="text-lg font-bold text-red-400">{stats.totalIntrusions}</div>
        <div className="text-xs text-slate-500">Total Events</div>
      </div>
      <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
        <div className="text-lg font-bold text-yellow-400">{stats.unacknowledged}</div>
        <div className="text-xs text-slate-500">Unreviewed</div>
      </div>
      <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
        <div className="text-lg font-bold text-slate-300">{stats.last24Hours}</div>
        <div className="text-xs text-slate-500">Last 24h</div>
      </div>
      <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
        <div className="text-lg font-bold text-slate-300">{stats.averagePersonCount}</div>
        <div className="text-xs text-slate-500">Avg Persons</div>
      </div>
    </div>
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

// =============================================================================
// Main Component
// =============================================================================

interface IntrusionGalleryProps {
  className?: string;
  limit?: number;
}

export function IntrusionGallery({ className = '', limit }: IntrusionGalleryProps) {
  const [frames, setFrames] = useState<IntrusionFrameDB[]>([]);
  const [stats, setStats] = useState<IntrusionStats>({
    totalIntrusions: 0,
    unacknowledged: 0,
    last24Hours: 0,
    last7Days: 0,
    averagePersonCount: 0,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewingFrame, setViewingFrame] = useState<IntrusionFrameDB | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Load frames
  const loadFrames = useCallback(async () => {
    setIsLoading(true);
    try {
      const [loadedFrames, loadedStats] = await Promise.all([
        getAllIntrusionFrames(limit),
        getIntrusionStats(),
      ]);
      setFrames(loadedFrames);
      setStats(loadedStats);
    } catch (error) {
      console.error('[IntrusionGallery] Failed to load frames:', error);
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    loadFrames();
  }, [loadFrames]);

  // Handle selection
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(frames.map((f) => f.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Handle actions
  const handleAcknowledge = async (id: string) => {
    await acknowledgeIntrusionFrame(id);
    await loadFrames();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this intrusion record?')) {
      await deleteIntrusionFrame(id);
      await loadFrames();
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} intrusion record(s)?`)) return;

    for (const id of selectedIds) {
      await deleteIntrusionFrame(id);
    }
    setSelectedIds(new Set());
    await loadFrames();
  };

  const handleExport = async (format: 'json' | 'csv') => {
    setIsExporting(true);
    try {
      const ids = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
      const result = await exportIntrusionFrames(format, ids);
      const blob = new Blob([result.data], {
        type: format === 'json' ? 'application/json' : 'text/csv',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[IntrusionGallery] Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle viewer navigation
  const viewingIndex = viewingFrame
    ? frames.findIndex((f) => f.id === viewingFrame.id)
    : -1;

  const handlePreviousFrame = () => {
    if (viewingIndex > 0) {
      setViewingFrame(frames[viewingIndex - 1]);
    }
  };

  const handleNextFrame = () => {
    if (viewingIndex < frames.length - 1) {
      setViewingFrame(frames[viewingIndex + 1]);
    }
  };

  // Empty state
  if (!isLoading && frames.length === 0) {
    return (
      <div className={`bg-slate-900 border border-slate-700 rounded-xl p-8 text-center ${className}`}>
        <IconAlertTriangle size={48} className="mx-auto text-slate-600 mb-4" />
        <h3 className="text-lg font-semibold text-slate-400 mb-2">
          No saved pictures
        </h3>
        <p className="text-sm text-slate-500">
          Pictures show here when more people are in view than the watch allows.
        </p>
      </div>
    );
  }

  return (
    <div className={`bg-slate-900 border border-slate-700 rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <IconAlertTriangle size={20} className="text-red-400" />
            People history
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => handleExport('json')}
              disabled={isExporting || frames.length === 0}
              className="px-3 py-1.5 text-sm bg-slate-700 text-slate-300 rounded hover:bg-slate-600 disabled:opacity-50 flex items-center gap-1"
            >
              <IconDownload size={14} />
              JSON
            </button>
            <button
              onClick={() => handleExport('csv')}
              disabled={isExporting || frames.length === 0}
              className="px-3 py-1.5 text-sm bg-slate-700 text-slate-300 rounded hover:bg-slate-600 disabled:opacity-50 flex items-center gap-1"
            >
              <IconDownload size={14} />
              CSV
            </button>
          </div>
        </div>

        {/* Stats */}
        <StatsBar stats={stats} />
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="px-4 py-2 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
          <span className="text-sm text-slate-400">
            {selectedIds.size} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={clearSelection}
              className="px-2 py-1 text-xs text-slate-400 hover:text-white"
            >
              Clear
            </button>
            <button
              onClick={selectAll}
              className="px-2 py-1 text-xs text-slate-400 hover:text-white"
            >
              Select All
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
            >
              Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="p-8 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-slate-600 border-t-emerald-500 rounded-full mx-auto" />
        </div>
      ) : (
        /* Grid */
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[600px] overflow-y-auto">
          {frames.map((frame) => (
            <FrameCard
              key={frame.id}
              frame={frame}
              isSelected={selectedIds.has(frame.id)}
              onSelect={() => toggleSelection(frame.id)}
              onAcknowledge={() => handleAcknowledge(frame.id)}
              onDelete={() => handleDelete(frame.id)}
              onView={() => setViewingFrame(frame)}
            />
          ))}
        </div>
      )}

      {/* Frame Viewer Modal */}
      {viewingFrame && (
        <FrameViewer
          frame={viewingFrame}
          onClose={() => setViewingFrame(null)}
          onPrevious={handlePreviousFrame}
          onNext={handleNextFrame}
          hasPrevious={viewingIndex > 0}
          hasNext={viewingIndex < frames.length - 1}
        />
      )}
    </div>
  );
}

export default IntrusionGallery;
