/**
 * Lost & Found Setup Component
 * 
 * Allows users to upload reference photos and configure
 * the Lost & Found matcher settings for a lost pet or an item.
 * 
 * @module components/LostFoundSetup
 */

'use client';

import { useState, useRef, useCallback } from 'react';
import { 
  IconUpload, 
  IconX, 
  IconCheck, 
  IconCamera,
  IconPaw,
  IconSearch,
} from './icons';
import { generateFingerprint, mergeFingerprints, type VisualFingerprint } from '../lib/visual-fingerprint';
import { useLostFoundStore, createSubjectProfile, type SubjectType } from '../stores/lost-found-store';
import { saveSubjectProfile } from '../lib/client-db';
import { createThumbnailFromSource } from '../lib/image-utils';

// =============================================================================
// Types
// =============================================================================

interface LostFoundSetupProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Format milliseconds to human-readable duration
 */
function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds} sec`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes} min`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

interface ImagePreview {
  id: string;
  src: string;
  file: File;
}

// =============================================================================
// LostFoundSetup Component
// =============================================================================

export function LostFoundSetup({ onComplete, onCancel }: LostFoundSetupProps) {
  const [step, setStep] = useState<'type' | 'upload' | 'configure' | 'processing'>('type');
  const [subjectType, setSubjectType] = useState<SubjectType>('pet');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { addSubject, setActiveSubject, settings, updateSettings } = useLostFoundStore();

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setError(null);
    
    files.forEach(file => {
      if (!file.type.startsWith('image/')) {
        setError('Please select image files only');
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) {
        setError('Images must be under 10MB');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target?.result as string;
        (async () => {
          const preview = await createThumbnailFromSource(src, {
            maxWidth: 768,
            maxHeight: 768,
            quality: 0.9,
            mimeType: 'image/jpeg',
          });
          setImages(prev => [
            ...prev,
            {
              id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              src: preview,
              file,
            },
          ].slice(0, 5)); // Max 5 images
        })().catch(() => {
          setImages(prev => [
            ...prev,
            {
              id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              src,
              file,
            },
          ].slice(0, 5));
        });
      };
      reader.readAsDataURL(file);
    });
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Remove image
  const removeImage = useCallback((id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  }, []);

  // Process images and create subject
  const processAndCreate = useCallback(async () => {
    if (images.length === 0 || !name.trim()) {
      setError('Please provide a name and at least one image');
      return;
    }
    
    setStep('processing');
    setIsProcessing(true);
    setError(null);
    setProcessingProgress(0);
    
    try {
      // Generate fingerprints for each image
      const fingerprints: VisualFingerprint[] = [];
      
      for (let i = 0; i < images.length; i++) {
        const fp = await generateFingerprint(images[i].src, name);
        fingerprints.push(fp);
        setProcessingProgress(Math.round(((i + 1) / images.length) * 80));
      }
      
      // Merge fingerprints
      const mergedFingerprint = mergeFingerprints(fingerprints);
      setProcessingProgress(90);
      
      // Create subject profile
      const referenceImages = images.map(img => img.src);
      const subject = createSubjectProfile(
        name.trim(),
        subjectType,
        description.trim(),
        mergedFingerprint,
        referenceImages
      );
      
      // Save to store and IndexedDB
      addSubject(subject);
      await saveSubjectProfile({
        id: subject.id,
        name: subject.name,
        type: subject.type,
        description: subject.description,
        fingerprint: subject.fingerprint,
        referenceImages: subject.referenceImages,
        createdAt: subject.createdAt,
        lastActiveAt: subject.lastActiveAt,
        matchCount: subject.matchCount,
      });
      
      // Set as active subject
      setActiveSubject(subject);
      
      setProcessingProgress(100);
      
      // Complete
      setTimeout(() => {
        onComplete?.();
      }, 500);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process images');
      setStep('upload');
    } finally {
      setIsProcessing(false);
    }
  }, [images, name, description, subjectType, addSubject, setActiveSubject, onComplete]);

  // Render step content
  const renderStep = () => {
    switch (step) {
      case 'type':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-white mb-2">
                What are you looking for?
              </h2>
              <p className="text-sm text-[var(--color-steel-400)]">
                Select the type of subject you want to watch for
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <TypeCard
                type="pet"
                icon={<IconPaw size={32} />}
                label="Pet"
                description="Dog, cat, or other animal"
                selected={subjectType === 'pet'}
                onClick={() => setSubjectType('pet')}
              />
              <TypeCard
                type="other"
                icon={<IconSearch size={32} />}
                label="Other"
                description="Object or item"
                selected={subjectType === 'other'}
                onClick={() => setSubjectType('other')}
              />
            </div>
            
            <div className="flex justify-between pt-4">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-[var(--color-steel-400)] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep('upload')}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        );
      
      case 'upload':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-white mb-2">
                Upload Reference Photos
              </h2>
              <p className="text-sm text-[var(--color-steel-400)]">
                Add clear photos from different angles for better matching
              </p>
            </div>
            
            {/* Name input */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-steel-300)] mb-1">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Max, Luna, Dad"
                className="w-full px-3 py-2 bg-[var(--color-steel-800)] border border-[var(--color-steel-600)] rounded-lg text-white placeholder-[var(--color-steel-500)] focus:outline-none focus:border-emerald-500"
              />
            </div>
            
            {/* Description input */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-steel-300)] mb-1">
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Any distinguishing features..."
                rows={2}
                className="w-full px-3 py-2 bg-[var(--color-steel-800)] border border-[var(--color-steel-600)] rounded-lg text-white placeholder-[var(--color-steel-500)] focus:outline-none focus:border-emerald-500 resize-none"
              />
            </div>
            
            {/* Image upload area */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[var(--color-steel-600)] rounded-xl p-8 text-center cursor-pointer hover:border-emerald-500 transition-colors"
              >
                <IconUpload size={48} className="mx-auto text-[var(--color-steel-500)] mb-3" />
                <p className="text-[var(--color-steel-300)] font-medium">
                  Click to upload photos
                </p>
                <p className="text-sm text-[var(--color-steel-500)] mt-1">
                  PNG, JPG up to 10MB (max 5 images)
                </p>
              </div>
            </div>
            
            {/* Image previews */}
            {images.length > 0 && (
              <div className="grid grid-cols-5 gap-3">
                {images.map((img) => (
                  <div key={img.id} className="relative group">
                    <img
                      src={img.src}
                      alt="Reference"
                      className="w-full aspect-square object-cover rounded-lg"
                    />
                    <button
                      onClick={() => removeImage(img.id)}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <IconX size={14} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}
            
            <div className="flex justify-between pt-4">
              <button
                onClick={() => setStep('type')}
                className="px-4 py-2 text-[var(--color-steel-400)] hover:text-white transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep('configure')}
                disabled={images.length === 0 || !name.trim()}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-[var(--color-steel-700)] disabled:text-[var(--color-steel-500)] text-white rounded-lg transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        );
      
      case 'configure':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-white mb-2">
                Configure Detection
              </h2>
              <p className="text-sm text-[var(--color-steel-400)]">
                Adjust sensitivity and alert settings
              </p>
            </div>
            
            {/* Sensitivity slider */}
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-medium text-[var(--color-steel-300)]">
                  Color Sensitivity
                </label>
                <span className="text-sm text-emerald-400">{settings.colorSensitivity}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={settings.colorSensitivity}
                onChange={(e) => updateSettings({ colorSensitivity: parseInt(e.target.value) })}
                className="w-full accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-[var(--color-steel-500)] mt-1">
                <span>More matches</span>
                <span>Fewer, accurate</span>
              </div>
            </div>
            
            {/* Minimum confidence for alert */}
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-medium text-[var(--color-steel-300)]">
                  Alert Threshold
                </label>
                <span className="text-sm text-emerald-400">{settings.minConfidenceForAlert}%</span>
              </div>
              <input
                type="range"
                min="30"
                max="95"
                value={settings.minConfidenceForAlert}
                onChange={(e) => updateSettings({ minConfidenceForAlert: parseInt(e.target.value) })}
                className="w-full accent-emerald-500"
              />
              <p className="text-xs text-[var(--color-steel-500)] mt-1">
                Minimum confidence to trigger sound/notification
              </p>
            </div>
            
            {/* Alert options */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-[var(--color-steel-300)]">
                Alerts
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.alertSound}
                    onChange={(e) => updateSettings({ alertSound: e.target.checked })}
                    className="w-4 h-4 rounded accent-emerald-500"
                  />
                  <span className="text-sm text-[var(--color-steel-300)]">Sound alert</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.alertNotification}
                    onChange={(e) => updateSettings({ alertNotification: e.target.checked })}
                    className="w-4 h-4 rounded accent-emerald-500"
                  />
                  <span className="text-sm text-[var(--color-steel-300)]">Browser notification</span>
                </label>
              </div>
            </div>

            {/* Custom Media Overlay - Image Flash */}
            <div className="space-y-4 pt-4 border-t border-[var(--color-steel-700)]">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-[var(--color-steel-300)]">
                    Image Flash Overlay
                  </label>
                  <p className="text-xs text-[var(--color-steel-500)] mt-0.5">
                    Display uploaded photos when detected
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.customMediaEnabled}
                    onChange={(e) => updateSettings({ customMediaEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-[var(--color-steel-600)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {settings.customMediaEnabled && (
                <div className="space-y-4 pl-4 border-l-2 border-emerald-500/30">
                  {/* Display interval per image */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-sm text-[var(--color-steel-300)]">
                        Time per image
                      </label>
                      <span className="text-sm text-emerald-400">
                        {formatDuration(settings.customMediaImageIntervalMs)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="3000"
                      max="300000"
                      step="1000"
                      value={settings.customMediaImageIntervalMs}
                      onChange={(e) => updateSettings({ customMediaImageIntervalMs: parseInt(e.target.value) })}
                      className="w-full accent-emerald-500"
                    />
                    <div className="flex justify-between text-xs text-[var(--color-steel-500)] mt-1">
                      <span>3 sec</span>
                      <span>5 min</span>
                    </div>
                  </div>

                  {/* Playback mode */}
                  <div>
                    <label className="text-sm text-[var(--color-steel-300)] mb-2 block">
                      Playback mode
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => updateSettings({ customMediaPlaybackMode: 'count' })}
                        className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                          settings.customMediaPlaybackMode === 'count'
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                            : 'border-[var(--color-steel-600)] text-[var(--color-steel-400)] hover:border-[var(--color-steel-500)]'
                        }`}
                      >
                        Repeat X times
                      </button>
                      <button
                        onClick={() => updateSettings({ customMediaPlaybackMode: 'timer' })}
                        className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                          settings.customMediaPlaybackMode === 'timer'
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                            : 'border-[var(--color-steel-600)] text-[var(--color-steel-400)] hover:border-[var(--color-steel-500)]'
                        }`}
                      >
                        For duration
                      </button>
                      <button
                        onClick={() => updateSettings({ customMediaPlaybackMode: 'loop' })}
                        className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                          settings.customMediaPlaybackMode === 'loop'
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                            : 'border-[var(--color-steel-600)] text-[var(--color-steel-400)] hover:border-[var(--color-steel-500)]'
                        }`}
                      >
                        Until closed
                      </button>
                    </div>
                  </div>

                  {/* Count mode: repeat count */}
                  {settings.customMediaPlaybackMode === 'count' && (
                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-sm text-[var(--color-steel-300)]">
                          Repeat count
                        </label>
                        <span className="text-sm text-emerald-400">
                          {settings.customMediaRepeatCount} {settings.customMediaRepeatCount === 1 ? 'time' : 'times'}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={settings.customMediaRepeatCount}
                        onChange={(e) => updateSettings({ customMediaRepeatCount: parseInt(e.target.value) })}
                        className="w-full accent-emerald-500"
                      />
                    </div>
                  )}

                  {/* Timer mode: duration */}
                  {settings.customMediaPlaybackMode === 'timer' && (
                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-sm text-[var(--color-steel-300)]">
                          Display duration
                        </label>
                        <span className="text-sm text-emerald-400">
                          {formatDuration(settings.customMediaTimerMs)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="3000"
                        max="300000"
                        step="1000"
                        value={settings.customMediaTimerMs}
                        onChange={(e) => updateSettings({ customMediaTimerMs: parseInt(e.target.value) })}
                        className="w-full accent-emerald-500"
                      />
                      <div className="flex justify-between text-xs text-[var(--color-steel-500)] mt-1">
                        <span>3 sec</span>
                        <span>5 min</span>
                      </div>
                    </div>
                  )}

                  {/* TTS toggle */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.customMediaTTSEnabled}
                      onChange={(e) => updateSettings({ customMediaTTSEnabled: e.target.checked })}
                      className="w-4 h-4 rounded accent-emerald-500"
                    />
                    <span className="text-sm text-[var(--color-steel-300)]">
                      Speak alert message
                    </span>
                  </label>
                </div>
              )}
            </div>
            
            <div className="flex justify-between pt-4">
              <button
                onClick={() => setStep('upload')}
                className="px-4 py-2 text-[var(--color-steel-400)] hover:text-white transition-colors"
              >
                Back
              </button>
              <button
                onClick={processAndCreate}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
              >
                Start Watching
              </button>
            </div>
          </div>
        );
      
      case 'processing':
        return (
          <div className="text-center py-8">
            <div className="w-16 h-16 border-4 border-[var(--color-steel-600)] border-t-emerald-500 rounded-full animate-spin mx-auto" />
            <h2 className="text-xl font-semibold text-white mt-6 mb-2">
              Analyzing Photos
            </h2>
            <p className="text-sm text-[var(--color-steel-400)] mb-4">
              Creating visual fingerprint...
            </p>
            <div className="w-48 h-2 bg-[var(--color-steel-700)] rounded-full mx-auto overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${processingProgress}%` }}
              />
            </div>
            <p className="text-xs text-[var(--color-steel-500)] mt-2">
              {processingProgress}%
            </p>
          </div>
        );
    }
  };

  return (
    <div className="bg-[var(--color-steel-900)] border border-[var(--color-steel-700)] rounded-xl p-6 max-w-lg mx-auto">
      {/* Progress indicator */}
      {step !== 'processing' && (
        <div className="flex items-center justify-center gap-2 mb-6">
          {['type', 'upload', 'configure'].map((s, i) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-colors ${
                step === s
                  ? 'bg-emerald-500'
                  : ['type', 'upload', 'configure'].indexOf(step) > i
                    ? 'bg-emerald-500/50'
                    : 'bg-[var(--color-steel-600)]'
              }`}
            />
          ))}
        </div>
      )}
      
      {renderStep()}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface TypeCardProps {
  type: SubjectType;
  icon: React.ReactNode;
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}

function TypeCard({ icon, label, description, selected, onClick }: TypeCardProps) {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-xl border-2 text-center transition-all ${
        selected
          ? 'border-emerald-500 bg-emerald-500/10'
          : 'border-[var(--color-steel-600)] hover:border-[var(--color-steel-500)]'
      }`}
    >
      <div className={`mb-2 ${selected ? 'text-emerald-400' : 'text-[var(--color-steel-400)]'}`}>
        {icon}
      </div>
      <p className={`font-medium ${selected ? 'text-white' : 'text-[var(--color-steel-300)]'}`}>
        {label}
      </p>
      <p className="text-xs text-[var(--color-steel-500)] mt-1">
        {description}
      </p>
    </button>
  );
}

export default LostFoundSetup;
