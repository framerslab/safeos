'use client';

import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { useSaveNote } from '@/lib/settings-save';
import { SavedNote } from './SavedNote';

export function SpokenAlertVoice() {
  const choice = useSettingsStore((state) => state.spokenAlertVoiceURI);
  const save = useSettingsStore((state) => state.setSpokenAlertVoice);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[] | null>(null);
  const { note, changed } = useSaveNote();

  useEffect(() => {
    const synth = window.speechSynthesis;
    const read = () => setVoices(synth?.getVoices() ?? []);
    read();
    synth?.addEventListener('voiceschanged', read);
    return () => synth?.removeEventListener('voiceschanged', read);
  }, []);

  const online = voices?.filter((voice) => voice.localService === false) ?? [];
  const noLocal = voices !== null && !voices.some((voice) => voice.localService === true);
  const choiceIsAvailable = online.some((voice) => voice.voiceURI === choice);

  return (
    <div className="set-item mt-4">
      <div className="set-slider__top">
        <label htmlFor="spoken-alert-voice" className="set-row__name">Spoken alert voice</label>
        <SavedNote note={note} />
      </div>
      <select
        id="spoken-alert-voice"
        value={choice ?? ''}
        aria-describedby={noLocal ? 'spoken-alert-privacy spoken-alert-availability' : 'spoken-alert-privacy'}
        onChange={(event) => {
          save(event.target.value || null);
          changed();
        }}
        className="mt-2 min-h-11 w-full rounded-lg border border-slate-500 bg-slate-800 px-3 text-base text-white"
      >
        <option value="">Use a voice on this device</option>
        {choice && !choiceIsAvailable && <option value={choice}>Saved online voice is unavailable</option>}
        {online.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} (online)</option>)}
      </select>
      <p id="spoken-alert-privacy" className="set-line">Some browsers’ voices send the alert’s words to the browser maker.</p>
      {noLocal && (
        <p id="spoken-alert-availability" className="set-line">
          {choiceIsAvailable
            ? 'This browser offers no voice that stays on this device.'
            : 'This browser offers no voice that stays on this device. Spoken alerts stay quiet unless you choose an online voice.'}
        </p>
      )}
    </div>
  );
}
