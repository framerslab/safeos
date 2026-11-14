/**
 * SafeOS Guardian Logo Components
 *
 * Custom SVG logos for SafeOS and Frame.
 *
 * @module components/Logo
 */

import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * SafeOS Guardian Logo - Shield with Eye
 * Industrial, utilitarian design.
 */
export function SafeOSLogo({ size = 40, className = '' }: LogoProps) {
  const scale = size / 40;
  
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="SafeOS Guardian"
    >
      {/* Shield */}
      <path
        d="M20 2L5 8.5V18.5C5 28.5 11 35 20 38C29 35 35 28.5 35 18.5V8.5L20 2Z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      
      {/* Inner Shield */}
      <path
        d="M20 5L8 10.5V18.5C8 27 13 32.5 20 35C27 32.5 32 27 32 18.5V10.5L20 5Z"
        fill="currentColor"
        fillOpacity="0.05"
      />
      
      {/* Eye - Outer */}
      <circle
        cx="20"
        cy="18"
        r="7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      
      {/* Eye - Middle */}
      <circle
        cx="20"
        cy="18"
        r="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.5"
      />
      
      {/* Eye - Iris */}
      <circle
        cx="20"
        cy="18"
        r="3"
        fill="currentColor"
        opacity="0.3"
      />
      
      {/* Eye - Pupil */}
      <circle
        cx="20"
        cy="18"
        r="1.5"
        fill="currentColor"
      />
      
      {/* Eye - Highlight */}
      <circle
        cx="21"
        cy="17"
        r="0.5"
        fill="currentColor"
        opacity="0.8"
      />
    </svg>
  );
}

/**
 * SafeOS Guardian Wordmark
 * Logo with text beside it.
 */
export function SafeOSWordmark({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <SafeOSLogo size={32} className="text-[var(--color-accent-500)]" />
      <div>
        <div className="font-mono text-sm font-semibold text-[var(--color-steel-100)] uppercase tracking-wider leading-tight">
          SafeOS
        </div>
        <div className="font-mono text-[10px] text-[var(--color-steel-500)] uppercase tracking-widest">
          Guardian
        </div>
      </div>
    </div>
  );
}

/**
 * Frame Logo - Cloud with Neural Network
 */
export function FrameLogo({ size = 40, className = '' }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Frame"
    >
      {/* Cloud */}
      <path
        d="M32.5 18C32.5 20 31 21.5 29 21.5H9C7 21.5 5.5 20 5.5 18C5.5 16.3 6.7 14.9 8.4 14.5C8.1 13.9 8 13.3 8 12.6C8 9.8 10.3 7.5 13.1 7.5C14.1 7.5 15 7.8 15.8 8.3C17.1 5.5 20 3.5 23.4 3.5C28.1 3.5 32 7.4 32 12.1C32 12.4 31.98 12.7 31.95 13C32.55 13.6 33 14.5 33 15.5V18H32.5Z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      
      {/* Neural Nodes */}
      <circle cx="13" cy="15" r="1.5" fill="currentColor"/>
      <circle cx="20" cy="12" r="2" fill="currentColor"/>
      <circle cx="27" cy="15" r="1.5" fill="currentColor"/>
      <circle cx="16" cy="18" r="1" fill="currentColor" opacity="0.7"/>
      <circle cx="24" cy="18" r="1" fill="currentColor" opacity="0.7"/>
      
      {/* Connections */}
      <path d="M13 15L20 12" stroke="currentColor" strokeWidth="0.75" opacity="0.5"/>
      <path d="M20 12L27 15" stroke="currentColor" strokeWidth="0.75" opacity="0.5"/>
      <path d="M13 15L16 18" stroke="currentColor" strokeWidth="0.75" opacity="0.5"/>
      <path d="M20 12L16 18" stroke="currentColor" strokeWidth="0.75" opacity="0.5"/>
      <path d="M20 12L24 18" stroke="currentColor" strokeWidth="0.75" opacity="0.5"/>
      <path d="M27 15L24 18" stroke="currentColor" strokeWidth="0.75" opacity="0.5"/>
      
      {/* Data Lines */}
      <path d="M10 28L13 25L17 27L20 24L23 26L27 23L30 27" stroke="currentColor" strokeWidth="0.75" opacity="0.3" strokeLinecap="round"/>
      <path d="M10 32L14 29L18 31L21 28L25 30L29 27L30 31" stroke="currentColor" strokeWidth="0.75" opacity="0.2" strokeLinecap="round"/>
      
      {/* S Accent */}
      <path d="M17 35C17 35 18.5 33 20 33C21.5 33 23 35 23 36C23 37 21.5 38.5 20 38.5C18.5 38.5 17 37 17 37" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.5"/>
    </svg>
  );
}

/**
 * Frame Wordmark
 */
export function FrameWordmark({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <FrameLogo size={24} className="text-[#3B82F6]" />
      <span className="font-mono text-xs text-[var(--color-steel-500)] uppercase tracking-wider">
        Frame
      </span>
    </div>
  );
}

// Legacy alias for backwards compatibility
export const SuperCloudWordmark = FrameWordmark;
export const SuperCloudLogo = FrameLogo;

/**
 * Combined Logo - SafeOS + Frame Attribution
 */
export function SafeOSFullLogo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <SafeOSWordmark />
      <div className="flex items-center gap-1.5 opacity-60">
        <span className="text-[10px] text-[var(--color-steel-500)]">powered by</span>
        <FrameLogo size={16} className="text-[#3B82F6]" />
        <span className="font-mono text-[10px] text-[var(--color-steel-500)]">Frame</span>
      </div>
    </div>
  );
}

/**
 * Unified Logo Component
 * Configurable to show different variants.
 */
interface UnifiedLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showFrame?: boolean;
  /** @deprecated Use showFrame instead */
  showSuperCloud?: boolean;
  className?: string;
}

export function Logo({ size = 'md', showFrame = true, showSuperCloud, className = '' }: UnifiedLogoProps) {
  const logoSize = size === 'sm' ? 28 : size === 'md' ? 32 : 40;
  const shouldShowFrame = showSuperCloud ?? showFrame;

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <SafeOSLogo size={logoSize} className="text-[var(--color-accent-500)]" />
      <div className="flex flex-col">
        <span
          className="font-mono font-semibold uppercase tracking-wider leading-tight"
          style={{
            fontSize: size === 'sm' ? '15px' : size === 'md' ? '15px' : '17px',
            color: 'var(--color-steel-100)'
          }}
        >
          SafeOS
        </span>
        <span
          className="font-mono uppercase tracking-widest"
          style={{
            fontSize: size === 'sm' ? '13px' : size === 'md' ? '13px' : '14px',
            color: 'var(--color-steel-500)'
          }}
        >
          Guardian
        </span>
      </div>
      {shouldShowFrame && (
        <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-[var(--color-steel-800)]">
          <FrameLogo size={size === 'sm' ? 16 : 18} className="text-[#3B82F6]" />
        </div>
      )}
    </div>
  );
}

export default SafeOSLogo;

