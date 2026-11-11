'use client';

/**
 * Security Panel Component
 * 
 * Main control panel for the anti-theft/intruder detection system.
 * Features arm/disarm controls, person count settings, and alert mode configuration.
 * 
 * @module components/SecurityPanel
 */

import { useState, useEffect, useCallback, useRef, useId } from 'react';
import {
  IconShield,
  IconShieldCheck,
  IconAlertTriangle,
  IconBell,
  IconBellOff,
  IconVolume2,
  IconVolumeX,
  IconSettings,
  IconPlus,
  IconTrash,
  IconChevronDown,
  IconChevronUp,
} from './icons';
import { useSecurityStore, AlertMode, getAlertModeLabel, getArmingStateLabel } from '../stores/security-store';
import { getTTSManager, PRESET_MESSAGES } from '../lib/tts-alerts';

// =============================================================================
// Sub-Components
// =============================================================================

interface PersonCountSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

function PersonCountSlider({ value, onChange, disabled }: PersonCountSliderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">Allowed Persons</span>
        <span className="text-2xl font-bold text-emerald-400">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        disabled={disabled}
        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500 disabled:opacity-50"
      />
      <div className="flex justify-between text-xs text-slate-500">
        <span>0 (Empty room)</span>
        <span>10 (Crowded)</span>
      </div>
      <p className="text-xs text-slate-500">
        Alert triggers when more than {value} person{value !== 1 ? 's' : ''} detected
      </p>
    </div>
  );
}

interface AlertModeToggleProps {
  value: AlertMode;
  onChange: (mode: AlertMode) => void;
  disabled?: boolean;
}

function AlertModeToggle({ value, onChange, disabled }: AlertModeToggleProps) {
  return (
    <div className="space-y-3">
      <span className="text-sm font-medium text-slate-300">Alert Mode</span>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onChange('extreme')}
          disabled={disabled}
          className={`p-4 rounded-lg border-2 transition-all ${
            value === 'extreme'
              ? 'border-red-500 bg-red-500/20 text-red-400'
              : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <IconAlertTriangle size={24} className="mx-auto mb-2" />
          <div className="font-semibold">Extreme</div>
          <div className="text-xs mt-1 opacity-75">
            Sirens, TTS, Flash
          </div>
        </button>
        <button
          onClick={() => onChange('silent')}
          disabled={disabled}
          className={`p-4 rounded-lg border-2 transition-all ${
            value === 'silent'
              ? 'border-blue-500 bg-blue-500/20 text-blue-400'
              : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <IconBellOff size={24} className="mx-auto mb-2" />
          <div className="font-semibold">Silent</div>
          <div className="text-xs mt-1 opacity-75">
            Record only
          </div>
        </button>
      </div>
    </div>
  );
}

interface ArmButtonProps {
  armingState: 'disarmed' | 'arming' | 'armed' | 'triggered';
  armingTimeRemaining: number;
  onArm: () => void;
  onDisarm: () => void;
  /** Why arming is not possible yet; disarming always stays possible. */
  armBlockedReason?: string;
}

function ArmButton({ armingState, armingTimeRemaining, onArm, onDisarm, armBlockedReason }: ArmButtonProps) {
  const isArmed = armingState === 'armed' || armingState === 'triggered';
  const isArming = armingState === 'arming';
  const armBlocked = !isArmed && !isArming && Boolean(armBlockedReason);
  const reasonId = useId();
  
  const getButtonStyle = () => {
    switch (armingState) {
      case 'disarmed':
        return 'bg-emerald-600 hover:bg-emerald-700 text-white';
      case 'arming':
        return 'bg-yellow-600 hover:bg-yellow-700 text-black animate-pulse';
      case 'armed':
        return 'bg-red-600 hover:bg-red-700 text-white';
      case 'triggered':
        return 'bg-red-600 text-white animate-pulse ring-4 ring-red-400';
      default:
        return 'bg-slate-600 text-white';
    }
  };

  const getButtonText = () => {
    switch (armingState) {
      case 'disarmed':
        return 'ARM SYSTEM';
      case 'arming':
        return `ARMING (${armingTimeRemaining}s)`;
      case 'armed':
        return 'DISARM';
      case 'triggered':
        return 'DISARM (ALERT!)';
      default:
        return 'ARM';
    }
  };

  const handleClick = () => {
    if (isArmed || isArming) {
      onDisarm();
    } else if (!armBlocked) {
      onArm();
    }
  };

  return (
    <>
    <button
      onClick={handleClick}
      disabled={armBlocked}
      aria-describedby={armBlocked ? reasonId : undefined}
      className={`w-full py-6 px-8 rounded-xl font-bold text-xl uppercase tracking-wider transition-all disabled:cursor-not-allowed disabled:opacity-50 ${getButtonStyle()}`}
    >
      <div className="flex items-center justify-center gap-3">
        {armingState === 'triggered' ? (
          <IconAlertTriangle size={28} className="animate-bounce" />
        ) : isArmed ? (
          <IconShieldCheck size={28} />
        ) : (
          <IconShield size={28} />
        )}
        {getButtonText()}
      </div>
    </button>
    {armBlocked && (
      <p id={reasonId} className="mt-2 text-sm text-amber-300">{armBlockedReason}</p>
    )}
    </>
  );
}

interface StatusIndicatorProps {
  armingState: 'disarmed' | 'arming' | 'armed' | 'triggered';
  currentPersonCount: number;
  allowedPersons: number;
}

function StatusIndicator({ armingState, currentPersonCount, allowedPersons }: StatusIndicatorProps) {
  const isExcess = currentPersonCount > allowedPersons;
  
  const getStatusColor = () => {
    switch (armingState) {
      case 'triggered':
        return 'text-red-500';
      case 'armed':
        return isExcess ? 'text-red-500' : 'text-emerald-500';
      case 'arming':
        return 'text-yellow-500';
      default:
        return 'text-slate-500';
    }
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
        <div className="text-xs text-slate-500 uppercase mb-1">Status</div>
        <div className={`text-lg font-bold ${getStatusColor()}`}>
          {getArmingStateLabel(armingState)}
        </div>
      </div>
      <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
        <div className="text-xs text-slate-500 uppercase mb-1">Detected</div>
        <div className={`text-lg font-bold ${isExcess ? 'text-red-500' : 'text-emerald-500'}`}>
          {currentPersonCount} / {allowedPersons}
        </div>
      </div>
    </div>
  );
}

interface CustomMessageEditorProps {
  messages: string[];
  onAdd: (message: string) => void;
  onRemove: (index: number) => void;
}

function CustomMessageEditor({ messages, onAdd, onRemove }: CustomMessageEditorProps) {
  const [newMessage, setNewMessage] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAdd = () => {
    if (newMessage.trim()) {
      onAdd(newMessage.trim());
      setNewMessage('');
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <span className="text-sm font-medium text-slate-300">
          Custom TTS Messages ({messages.length})
        </span>
        {isExpanded ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
      </button>
      
      {isExpanded && (
        <div className="space-y-2 pt-2">
          {/* Preset examples */}
          <div className="text-xs text-slate-500 mb-2">
            Preset examples: {PRESET_MESSAGES.authoritative.slice(0, 2).join(' | ')}
          </div>
          
          {/* Custom messages list */}
          {messages.map((msg, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-2 bg-slate-800 rounded text-sm"
            >
              <span className="flex-1 text-slate-300 truncate">{msg}</span>
              <button
                onClick={() => onRemove(index)}
                className="p-1 text-red-400 hover:text-red-300"
              >
                <IconTrash size={16} />
              </button>
            </div>
          ))}
          
          {/* Add new message */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Add custom warning message..."
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={handleAdd}
              disabled={!newMessage.trim()}
              className="p-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <IconPlus size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

interface SecurityPanelProps {
  className?: string;
  onTrigger?: () => void;
  /** Set while the system cannot watch (for example, no detection model yet). */
  armBlockedReason?: string;
}

export function SecurityPanel({ className = '', onTrigger, armBlockedReason }: SecurityPanelProps) {
  const {
    armingState,
    settings,
    currentPersonCount,
    armingTimeRemaining,
    arm,
    disarm,
    setArmingTimeRemaining,
    setArmingState,
    setAllowedPersons,
    setAlertMode,
    updateAlertSettings,
    addCustomMessage,
    removeCustomMessage,
  } = useSecurityStore();

  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Handle arming countdown
  useEffect(() => {
    if (armingState === 'arming' && armingTimeRemaining > 0) {
      countdownRef.current = setInterval(() => {
        const newTime = armingTimeRemaining - 1;
        setArmingTimeRemaining(newTime);
        
        if (newTime <= 0) {
          setArmingState('armed');
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
          }
        }
      }, 1000);

      return () => {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
        }
      };
    }
  }, [armingState, armingTimeRemaining, setArmingTimeRemaining, setArmingState]);

  // Initialize TTS
  useEffect(() => {
    if (settings.alerts.tts.enabled) {
      const tts = getTTSManager();
      tts.initialize().catch(console.error);
      tts.setCustomMessages(settings.customMessages);
    }
  }, [settings.alerts.tts.enabled, settings.customMessages]);

  // Handle triggered state
  useEffect(() => {
    if (armingState === 'triggered') {
      onTrigger?.();
    }
  }, [armingState, onTrigger]);

  const isArmedOrArming = armingState === 'armed' || armingState === 'arming' || armingState === 'triggered';

  return (
    <div className={`bg-slate-900 border border-slate-700 rounded-xl p-6 space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <IconShield size={24} className="text-emerald-400" />
          Security Mode
        </h2>
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
          armingState === 'triggered'
            ? 'bg-red-500/20 text-red-400 animate-pulse'
            : armingState === 'armed'
            ? 'bg-emerald-500/20 text-emerald-400'
            : armingState === 'arming'
            ? 'bg-yellow-500/20 text-yellow-400'
            : 'bg-slate-700 text-slate-400'
        }`}>
          {getArmingStateLabel(armingState)}
        </div>
      </div>

      {/* Status Indicator */}
      <StatusIndicator
        armingState={armingState}
        currentPersonCount={currentPersonCount}
        allowedPersons={settings.allowedPersons}
      />

      {/* Arm/Disarm Button */}
      <ArmButton
        armingState={armingState}
        armingTimeRemaining={armingTimeRemaining}
        onArm={arm}
        onDisarm={disarm}
        armBlockedReason={armBlockedReason}
      />

      {/* Settings (disabled when armed) */}
      <div className={`space-y-6 transition-opacity ${isArmedOrArming ? 'opacity-50' : ''}`}>
        {/* Person Count */}
        <PersonCountSlider
          value={settings.allowedPersons}
          onChange={setAllowedPersons}
          disabled={isArmedOrArming}
        />

        {/* Alert Mode */}
        <AlertModeToggle
          value={settings.alertMode}
          onChange={setAlertMode}
          disabled={isArmedOrArming}
        />

        {/* Alert Settings */}
        {settings.alertMode === 'extreme' && (
          <div className="space-y-4 p-4 bg-slate-800/30 rounded-lg">
            <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <IconSettings size={16} />
              Alert Settings
            </h3>
            
            {/* Siren */}
            <label className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Siren Sound</span>
              <button
                onClick={() => updateAlertSettings({ 
                  sirenEnabled: !settings.alerts.sirenEnabled 
                })}
                disabled={isArmedOrArming}
                className={`p-2 rounded-lg transition-colors ${
                  settings.alerts.sirenEnabled
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-slate-700 text-slate-500'
                }`}
              >
                {settings.alerts.sirenEnabled ? (
                  <IconVolume2 size={18} />
                ) : (
                  <IconVolumeX size={18} />
                )}
              </button>
            </label>

            {/* TTS */}
            <label className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Voice Warnings</span>
              <button
                onClick={() => updateAlertSettings({ 
                  tts: { ...settings.alerts.tts, enabled: !settings.alerts.tts.enabled } 
                })}
                disabled={isArmedOrArming}
                className={`p-2 rounded-lg transition-colors ${
                  settings.alerts.tts.enabled
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-slate-700 text-slate-500'
                }`}
              >
                {settings.alerts.tts.enabled ? (
                  <IconBell size={18} />
                ) : (
                  <IconBellOff size={18} />
                )}
              </button>
            </label>

            {/* Flash */}
            <label className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Screen Flash</span>
              <button
                onClick={() => updateAlertSettings({
                  flashEnabled: !settings.alerts.flashEnabled
                })}
                disabled={isArmedOrArming}
                aria-label={settings.alerts.flashEnabled ? 'Disable screen flash' : 'Enable screen flash'}
                aria-pressed={settings.alerts.flashEnabled}
                className={`p-2 rounded-lg transition-colors ${
                  settings.alerts.flashEnabled
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-slate-700 text-slate-500'
                }`}
              >
                {settings.alerts.flashEnabled ? (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="12" cy="12" r="8" />
                  </svg>
                )}
              </button>
            </label>

            {/* Volume Slider */}
            {settings.alerts.sirenEnabled && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Siren Volume</span>
                  <span className="text-slate-300">{settings.alerts.sirenVolume}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={settings.alerts.sirenVolume}
                  onChange={(e) => updateAlertSettings({ 
                    sirenVolume: parseInt(e.target.value) 
                  })}
                  disabled={isArmedOrArming}
                  className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                />
              </div>
            )}

            {/* Custom Messages */}
            {settings.alerts.tts.enabled && (
              <CustomMessageEditor
                messages={settings.customMessages}
                onAdd={addCustomMessage}
                onRemove={removeCustomMessage}
              />
            )}
          </div>
        )}

        {/* Silent mode info */}
        {settings.alertMode === 'silent' && (
          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-sm text-blue-300">
              <strong>Silent Mode:</strong> Intrusions will be recorded without sound or visual alerts.
              You can review captured frames in the Intrusion Gallery.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default SecurityPanel;

