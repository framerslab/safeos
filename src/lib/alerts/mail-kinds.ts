/**
 * Mail Kinds
 *
 * Every mail SafeOS Guardian sends has a kind. The kind decides its
 * unsubscribe category, whether it is required, and the footer line that says
 * why the person gets it.
 *
 * - Optional mail (alerts and the settings test message) stops when the
 *   person unsubscribes.
 * - Required mail (account verification and password reset) is sent only when
 *   someone asks for it; its unsubscribe link opens a page that turns off every
 *   optional mail and says what still comes.
 *
 * @module lib/alerts/mail-kinds
 */

export type MailKind = 'alert' | 'test' | 'verification' | 'password-reset';

export type MailCategory = 'alerts' | 'account';

/**
 * What a suppression stops:
 * - a category: that category's mail
 * - `optional`: every optional mail
 * - `all`: every mail, required mail included (a manual stop by the operator)
 */
export type SuppressionScope = MailCategory | 'optional' | 'all';

export interface MailKindInfo {
  category: MailCategory;
  required: boolean;
  /** Footer line: why this person gets this mail. */
  why: string;
}

export const MAIL_KINDS: Readonly<Record<MailKind, MailKindInfo>> = {
  alert: {
    category: 'alerts',
    required: false,
    why: 'You get this mail because alert email is turned on for this address in SafeOS Guardian.',
  },
  test: {
    category: 'alerts',
    required: false,
    why: "You get this mail because someone sent a test message to this address from SafeOS Guardian's notification settings.",
  },
  verification: {
    category: 'account',
    required: true,
    why: 'You get this mail because someone signed up for a SafeOS Guardian account with this address.',
  },
  'password-reset': {
    category: 'account',
    required: true,
    why: 'You get this mail because someone asked to reset the password of the SafeOS Guardian account with this address.',
  },
};

const CATEGORIES: readonly MailCategory[] = ['alerts', 'account'];
const REQUIRED_CATEGORIES: readonly MailCategory[] = ['account'];

export function isMailKind(value: unknown): value is MailKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MAIL_KINDS, value);
}

export function isMailCategory(value: unknown): value is MailCategory {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

export function isRequiredCategory(category: MailCategory): boolean {
  return REQUIRED_CATEGORIES.includes(category);
}
