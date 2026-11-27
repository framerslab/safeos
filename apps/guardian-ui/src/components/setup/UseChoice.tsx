/**
 * Setup's question: what is it watching?
 *
 * Five answers in one group named by step 2's heading: the four uses and a
 * lost pet, as native radios, so a press on the answer already chosen
 * changes nothing. The chosen answer's words stand under the group and are
 * read when they change; the baby's carry the statement that SafeOS is not a
 * medical device, with two links. A press on the last key with no answer
 * chosen is named above the group.
 *
 * @module components/setup/UseChoice
 */

'use client';

import { useEffect, useRef } from 'react';
import { ProblemMark } from '@/components/dashboard/Drawn';
import { SAFE_SLEEP_URL } from '@/components/NotAMedicalDevice';
import { SETUP_CHOICES, type SetupChoice } from '@/lib/setup-steps';
import { UseGlyph } from './drawings';

export const CHOICE_NAMES: Readonly<Record<SetupChoice, string>> = {
  pet: 'A pet',
  baby: 'A baby',
  elderly: 'An elderly relative',
  security: 'An empty place',
  lost_found: 'A lost pet',
};

/** What setup says while A baby is chosen: SafeOS is not a medical device. One string, so a page check finds it whole. */
export const BABY_STATEMENT = 'SafeOS is not a medical device. It does not watch breathing or any vital sign and cannot detect or prevent SIDS. Follow safe-sleep guidance.';

export const CORD_SAFETY_URL = 'https://www.cpsc.gov/content/baby-monitor-cords-have-strangled-children';

/** What setup says while A lost pet is chosen. One string, so a page check finds it whole. */
export const LOST_PET_WORDS = 'SafeOS watches for your pet’s colours near home and keeps a picture of each possible sighting. Add your pet’s photos on the Lost and Found page, then press Start watching there.';

export interface UseChoiceProps {
  /** The answer shown chosen; null shows none. */
  chosen: SetupChoice | null;
  /** The last key was pressed with no use chosen. */
  missing: boolean;
  /** Each rise moves focus to the first option. */
  focusFirst: number;
  onChoose: (choice: SetupChoice) => void;
}

/** A link to another site, named as one that opens in a new tab. */
function OutLink({ href, children }: { href: string; children: string }) {
  return (
    <a className="link-row" href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only">, opens in a new tab</span>
    </a>
  );
}

function ChoiceWords({ choice }: { choice: SetupChoice }) {
  switch (choice) {
    case 'pet':
      return (
        <p className="setup-body">
          SafeOS sounds an alert here when your pet moves. History lists each alert with its time, for when you get back.
        </p>
      );
    case 'baby':
      return (
        <>
          <p className="setup-body">For a nap while you stay close enough to hear this device.</p>
          <p className="setup-body">{BABY_STATEMENT}</p>
          <OutLink href={SAFE_SLEEP_URL}>Safe-sleep guidance from the NIH</OutLink>
          <p className="setup-body">Keep this device and its cord at least 3 feet (1 metre) from the crib.</p>
          <OutLink href={CORD_SAFETY_URL}>Cord safety from the CPSC</OutLink>
        </>
      );
    case 'elderly':
      return (
        <>
          <p className="setup-body">
            SafeOS sounds an alert here when they move or make a sound, and, if you set a time in Settings, when nothing moves
            for that long.
          </p>
          <p className="setup-body">Ask before you watch or listen to another adult. Laws on recording sound differ by place.</p>
        </>
      );
    case 'security':
      return (
        <p className="setup-body">
          SafeOS sounds an alert here when anything moves in the picture or this device hears a sound. Point it at a room, a
          doorway or a yard.
        </p>
      );
    case 'lost_found':
      return <p className="setup-body">{LOST_PET_WORDS}</p>;
  }
}

export function UseChoice({ chosen, missing, focusFirst, onChoose }: UseChoiceProps) {
  const first = useRef<HTMLInputElement>(null);
  const lastFocus = useRef(focusFirst);

  // Each rise after the first render moves focus to the first option.
  useEffect(() => {
    if (focusFirst > lastFocus.current) first.current?.focus();
    lastFocus.current = focusFirst;
  }, [focusFirst]);

  return (
    <>
      <div className="setup-use-says" role="status" aria-live="polite">
        {missing ? (
          <p className="setup-body setup-use-missing">
            <ProblemMark />
            <span>Choose what this device is watching.</span>
          </p>
        ) : null}
      </div>
      <div className="setup-uses" role="radiogroup" aria-labelledby="setup-step2-heading" aria-describedby="setup-use-words">
        {SETUP_CHOICES.map((choice, index) => (
          <label key={choice} className="setup-use">
            <input
              ref={index === 0 ? first : undefined}
              className="setup-use__input"
              type="radio"
              name="setup-use"
              value={choice}
              checked={chosen === choice}
              onChange={() => onChoose(choice)}
            />
            <span className="setup-use__box" data-chosen={chosen === choice ? 'true' : 'false'}>
              <span className="setup-use__slot" aria-hidden="true">
                {chosen === choice ? <span className="setup-use__square" /> : null}
              </span>
              <UseGlyph use={choice} />
              <span className="setup-use__name">{CHOICE_NAMES[choice]}</span>
            </span>
          </label>
        ))}
      </div>
      <div id="setup-use-words" className="setup-use-words" aria-live="polite">
        {chosen ? (
          <div key={chosen}>
            <ChoiceWords choice={chosen} />
          </div>
        ) : null}
      </div>
    </>
  );
}

export default UseChoice;
