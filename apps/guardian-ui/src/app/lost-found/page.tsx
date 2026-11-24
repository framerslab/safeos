/**
 * Lost and Found page
 * 
 * Setup page for watching your own camera for anything with a lost pet's colouring.
 * 
 * @module app/lost-found/page
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  IconSearch,
  IconPlus,
  IconPaw,
  IconUser,
  IconArrowRight,
  IconTrash,
  IconHistory,
} from '../../components/icons';
import { LostFoundSetup } from '../../components/LostFoundSetup';
import { SubjectPreview } from '../../components/SubjectPreview';
import { useLostFoundStore, getSubjectTypeLabel } from '../../stores/lost-found-store';
import { useOnboardingStore } from '../../stores/onboarding-store';
import { countMatchFramesBySubject, getAllSubjectProfiles, deleteSubjectProfile, type SubjectProfileDB } from '../../lib/client-db';
import { useStartGuard } from '../../lib/start-guard';
import { savedSightings } from '../../lib/lost-found-words';

export default function LostFoundPage() {
  const router = useRouter();
  const [showSetup, setShowSetup] = useState(false);
  const [savedSubjects, setSavedSubjects] = useState<SubjectProfileDB[]>([]);
  // How many pictures this device keeps for each subject; null until read,
  // or when the read fails, and then no count shows.
  const [savedPictures, setSavedPictures] = useState<Record<string, number> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const countLine = (id: string): string => {
    const count = savedPictures?.[id];
    return count === undefined ? '' : `${savedSightings(count)} • `;
  };
  
  const { 
    activeSubject, 
    setActiveSubject, 
    subjects,
    startWatching,
    isWatching,
  } = useLostFoundStore();
  const setLostFoundChosen = useOnboardingStore((state) => state.setLostFoundChosen);

  // Load saved subjects from IndexedDB
  useEffect(() => {
    const loadSubjects = async () => {
      try {
        const profiles = await getAllSubjectProfiles();
        setSavedSubjects(profiles);
        setSavedPictures(await countMatchFramesBySubject(profiles.map((profile) => profile.id)));
      } catch (error) {
        console.error('Failed to load subjects:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSubjects();
  }, [subjects]); // Reload when store subjects change

  // Handle subject selection
  const handleSelectSubject = (subject: SubjectProfileDB) => {
    setActiveSubject({
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
  };

  // Handle delete subject
  const handleDeleteSubject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this subject? Its saved pictures are deleted too.')) {
      await deleteSubjectProfile(id);
      setSavedSubjects(prev => prev.filter(s => s.id !== id));
      if (activeSubject?.id === id) {
        setActiveSubject(null);
      }
    }
  };

  // While another tab watches, the start key asks first.
  const { guard, dialog } = useStartGuard();

  // Handle start monitoring: the watch opens with Lost and Found chosen and
  // this pet, the one the watch compares with. A person an earlier version
  // saved is never compared, so it has no start key. The start is for the pet
  // chosen at the press: another chosen while the other tabs answer starts
  // nothing.
  const handleStartMonitoring = (petId: string) => () => {
    const current = useLostFoundStore.getState().activeSubject;
    if (!current || current.id !== petId || current.type === 'person') return false;
    setLostFoundChosen(true);
    startWatching();
    router.push(`/monitor/?way=lost-found&pet=${encodeURIComponent(petId)}`);
  };

  // Setup complete handler
  const handleSetupComplete = () => {
    setShowSetup(false);
    // Reload subjects
    getAllSubjectProfiles().then(setSavedSubjects);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'pet':
        return <IconPaw size={20} />;
      case 'person':
        return <IconUser size={20} />;
      default:
        return <IconSearch size={20} />;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--color-steel-600)] border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">
            Lost and Found
          </h1>
          <p className="text-[var(--color-steel-400)]">
            Watch your camera for anything with your lost pet&apos;s colouring
          </p>
        </div>

        {/* Show setup wizard or main content */}
        {showSetup ? (
          <LostFoundSetup
            onComplete={handleSetupComplete}
            onCancel={() => setShowSetup(false)}
          />
        ) : (
          <div className="space-y-8">
            {/* Active subject */}
            {activeSubject && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">
                    Currently Watching
                  </h2>
                  {!isWatching && activeSubject.type !== 'person' && (
                    <button
                      onClick={(event) => void guard(handleStartMonitoring(activeSubject.id), event.currentTarget)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-2 transition-colors"
                    >
                      Start Monitoring
                      <IconArrowRight size={16} />
                    </button>
                  )}
                </div>
                
                <SubjectPreview
                  mode="full"
                  showClose={true}
                  savedPictures={savedPictures?.[activeSubject.id]}
                  onClose={() => setActiveSubject(null)}
                />
                
                {isWatching && (
                  <div className="flex items-center gap-3">
                    <Link
                      href="/monitor"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
                    >
                      Go to Monitor
                    </Link>
                    <Link
                      href="/lost-found/gallery"
                      className="px-4 py-2 bg-[var(--color-steel-700)] hover:bg-[var(--color-steel-600)] text-white rounded-lg flex items-center gap-2 transition-colors"
                    >
                      <IconHistory size={16} />
                      Saved pictures
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Add new subject */}
            <div>
              <button
                onClick={() => setShowSetup(true)}
                className="w-full p-6 border-2 border-dashed border-[var(--color-steel-600)] rounded-xl text-center hover:border-emerald-500 transition-colors group"
              >
                <div className="w-12 h-12 rounded-full bg-[var(--color-steel-800)] flex items-center justify-center mx-auto mb-3 group-hover:bg-emerald-500/20 transition-colors">
                  <IconPlus size={24} className="text-[var(--color-steel-400)] group-hover:text-emerald-400 transition-colors" />
                </div>
                <p className="text-[var(--color-steel-300)] font-medium group-hover:text-white transition-colors">
                  Add New Subject to Watch
                </p>
                <p className="text-sm text-[var(--color-steel-500)] mt-1">
                  Upload photos of your lost pet
                </p>
              </button>
            </div>

            {/* Saved subjects */}
            {savedSubjects.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-4">
                  Saved Subjects
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {savedSubjects.map((subject) => (
                    <div
                      key={subject.id}
                      onClick={() => handleSelectSubject(subject)}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        activeSubject?.id === subject.id
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-[var(--color-steel-700)] hover:border-[var(--color-steel-600)] bg-[var(--color-steel-900)]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Thumbnail */}
                        <div className="w-14 h-14 rounded-lg overflow-hidden bg-[var(--color-steel-800)] flex-shrink-0">
                          {subject.referenceImages[0] ? (
                            <img
                              src={subject.referenceImages[0]}
                              alt={subject.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[var(--color-steel-500)]">
                              {getTypeIcon(subject.type)}
                            </div>
                          )}
                        </div>
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-white truncate">
                              {subject.name}
                            </h3>
                            <span className="px-2 py-0.5 bg-[var(--color-steel-700)] text-[var(--color-steel-400)] text-xs rounded-full">
                              {getSubjectTypeLabel(subject.type)}
                            </span>
                          </div>
                          <p className="text-sm text-[var(--color-steel-400)] mt-1">
                            {countLine(subject.id)}Created {new Date(subject.createdAt).toLocaleDateString()}
                          </p>
                          {subject.description && (
                            <p className="text-sm text-[var(--color-steel-500)] mt-1 truncate">
                              {subject.description}
                            </p>
                          )}
                        </div>
                        
                        {/* Delete button */}
                        <button
                          onClick={(e) => handleDeleteSubject(subject.id, e)}
                          className="p-2 text-[var(--color-steel-500)] hover:text-red-400 transition-colors"
                          aria-label={`Delete ${subject.name}`}
                        >
                          <IconTrash size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Match history link */}
            {savedSubjects.length > 0 && (
              <Link
                href="/lost-found/gallery"
                className="block p-4 bg-[var(--color-steel-800)] hover:bg-[var(--color-steel-700)] rounded-xl transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <IconHistory size={20} className="text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">Saved pictures</p>
                      <p className="text-sm text-[var(--color-steel-400)]">
                        Every picture the watch saved for a possible sighting
                      </p>
                    </div>
                  </div>
                  <IconArrowRight size={20} className="text-[var(--color-steel-400)]" />
                </div>
              </Link>
            )}

            {/* Empty state */}
            {savedSubjects.length === 0 && !activeSubject && (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-[var(--color-steel-800)] flex items-center justify-center mx-auto mb-4">
                  <IconSearch size={32} className="text-[var(--color-steel-500)]" />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">
                  No Subjects Yet
                </h3>
                <p className="text-[var(--color-steel-400)] max-w-md mx-auto">
                  Add a subject to start watching. Upload photos of your lost pet, and the monitor
                  checks your camera for anything with the same colouring while it stays open.
                </p>
              </div>
            )}

            {/* Info section */}
            <div className="p-4 bg-[var(--color-steel-900)] border border-[var(--color-steel-700)] rounded-xl">
              <h3 className="font-medium text-white mb-2">How it works</h3>
              <ul className="space-y-2 text-sm text-[var(--color-steel-400)]">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                  Upload clear photos of the subject from different angles
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                  Your browser records the photos&apos; colours, a coarse edge grid and size
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                  Start monitoring and keep the monitor open; it checks one to two frames a second
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">4</span>
                  Get an alert when the colours and shape are like the photos; another animal or an object of similar colour can set it off too
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {dialog}
    </div>
  );
}

