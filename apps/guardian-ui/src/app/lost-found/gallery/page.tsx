/**
 * Lost & Found Gallery Page
 * 
 * Displays all captured match frames with filtering and export.
 * 
 * @module app/lost-found/gallery/page
 */

'use client';

import Link from 'next/link';
import { IconArrowLeft } from '../../../components/icons';
import { MatchGallery } from '../../../components/MatchGallery';

export default function GalleryPage() {
  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/lost-found"
            className="inline-flex items-center gap-2 text-[var(--color-steel-400)] hover:text-white transition-colors mb-4"
          >
            <IconArrowLeft size={16} />
            Back to Lost & Found
          </Link>
          
          <h1 className="text-2xl font-bold text-white mb-2">
            Possible sightings
          </h1>
          <p className="text-[var(--color-steel-400)]">
            The pictures the watch saved when what it saw was like your pet’s photos.
          </p>
        </div>

        {/* Gallery */}
        <MatchGallery />
      </div>
    </div>
  );
}

