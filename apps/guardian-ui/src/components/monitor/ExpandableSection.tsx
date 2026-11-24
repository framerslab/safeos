/**
 * Expandable Section Component
 *
 * Reusable collapsible section wrapper with animated expand/collapse.
 * Shows a summary when collapsed, full content when expanded.
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';

interface ExpandableSectionProps {
  id: string;
  title: string;
  icon?: React.ReactNode;
  summary: React.ReactNode;
  summaryClassName?: string;
  defaultExpanded?: boolean;
  /** Expands the section when it turns true; the header still closes it. */
  open?: boolean;
  children: React.ReactNode;
  onToggle?: (expanded: boolean) => void;
}

export function ExpandableSection({
  id,
  title,
  icon,
  summary,
  summaryClassName = 'text-xs truncate',
  defaultExpanded = false,
  open,
  children,
  onToggle,
}: ExpandableSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  useEffect(() => {
    if (open) setIsExpanded(true);
  }, [open]);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [children, isExpanded]);

  const toggle = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    onToggle?.(newState);
  };

  return (
    <div
      className={`rounded-xl border transition-colors ${
        isExpanded
          ? 'bg-slate-800/70 border-slate-600/50'
          : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600/50'
      }`}
    >
      {/* Header - Always visible */}
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between p-4 text-left min-h-[56px]"
        aria-expanded={isExpanded}
        aria-controls={`${id}-content`}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {icon && (
            <span className="text-slate-400 flex-shrink-0">{icon}</span>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white">{title}</div>
            {!isExpanded && (
              <div className={`mt-0.5 text-slate-400 ${summaryClassName}`}>
                {summary}
              </div>
            )}
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-slate-400 transition-transform flex-shrink-0 ml-2 ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Content - Collapsible */}
      <div
        id={`${id}-content`}
        className="overflow-hidden transition-all duration-200 ease-out"
        style={{
          maxHeight: isExpanded ? `${contentHeight}px` : '0px',
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div ref={contentRef} className="px-4 pb-4 pt-0 space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Toggle switch component for settings
 */
interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label?: string;
  'aria-label'?: string;
}

export function ToggleSwitch({
  enabled,
  onChange,
  label,
  'aria-label': ariaLabel,
}: ToggleSwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel || label}
      onClick={() => onChange(!enabled)}
      className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
        enabled ? 'bg-emerald-500' : 'bg-slate-600'
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow-sm ${
          enabled ? 'left-6' : 'left-0.5'
        }`}
      />
    </button>
  );
}

/**
 * Slider with label and value display
 */
interface SettingsSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  color?: 'emerald' | 'blue' | 'purple' | 'amber' | 'red';
  tooltip?: string;
}

export function SettingsSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = '',
  color = 'emerald',
}: SettingsSliderProps) {
  const colorClasses = {
    emerald: 'text-emerald-400 [&::-webkit-slider-thumb]:bg-emerald-500',
    blue: 'text-blue-400 [&::-webkit-slider-thumb]:bg-blue-500',
    purple: 'text-purple-400 [&::-webkit-slider-thumb]:bg-purple-500',
    amber: 'text-amber-400 [&::-webkit-slider-thumb]:bg-amber-500',
    red: 'text-red-400 [&::-webkit-slider-thumb]:bg-red-500',
  };

  return (
    <div>
      <div className="flex justify-between text-xs mb-2">
        <span className="text-slate-400">{label}</span>
        <span className={`font-mono ${colorClasses[color].split(' ')[0]}`}>
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
                   [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:cursor-pointer ${colorClasses[color]}`}
        aria-label={label}
      />
    </div>
  );
}
