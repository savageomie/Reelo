/** Input validation shared by forms. The database enforces the same limits with CHECK constraints. */

export const LIMITS = {
  username: { min: 3, max: 20 },
  displayName: 50,
  bio: 300,
  review: 5000,
  comment: 1000,
  listTitle: 100,
  listDescription: 1000,
  listNote: 500,
  groupName: 60,
  tag: 30,
  tags: 10,
  password: 8,
} as const;

export type ValidationResult = { ok: true } | { ok: false; error: string };
const ok: ValidationResult = { ok: true };
const fail = (error: string): ValidationResult => ({ ok: false, error });

export function validateUsername(u: string): ValidationResult {
  const v = u.trim();
  if (v.length < LIMITS.username.min) return fail(`Username must be at least ${LIMITS.username.min} characters`);
  if (v.length > LIMITS.username.max) return fail(`Username must be at most ${LIMITS.username.max} characters`);
  if (!/^[a-z0-9_]+$/.test(v)) return fail('Use lowercase letters, numbers and underscores only');
  return ok;
}

export function validateEmail(e: string): ValidationResult {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()) ? ok : fail('Enter a valid email address');
}

export function validatePassword(p: string): ValidationResult {
  return p.length >= LIMITS.password ? ok : fail(`Password must be at least ${LIMITS.password} characters`);
}

export function validateLength(text: string, max: number, label: string, min = 0): ValidationResult {
  const len = text.trim().length;
  if (len < min) return fail(min === 1 ? `${label} can't be empty` : `${label} must be at least ${min} characters`);
  if (len > max) return fail(`${label} must be at most ${max} characters`);
  return ok;
}

export const validateReview = (t: string) => validateLength(t, LIMITS.review, 'Review');
export const validateComment = (t: string) => validateLength(t, LIMITS.comment, 'Comment', 1);
export const validateBio = (t: string) => validateLength(t, LIMITS.bio, 'Bio');
export const validateListTitle = (t: string) => validateLength(t, LIMITS.listTitle, 'Title', 1);

/** Normalise free-text tags: trim, lowercase, dedupe, limit count and length. */
export function normaliseTags(input: string | string[]): string[] {
  const raw = Array.isArray(input) ? input : input.split(',');
  const out: string[] = [];
  for (const t of raw) {
    const v = t.trim().toLowerCase().replace(/\s+/g, '-').slice(0, LIMITS.tag);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= LIMITS.tags) break;
  }
  return out;
}
