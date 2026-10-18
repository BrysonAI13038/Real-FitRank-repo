// Pure logic for email one-time-code sign-in: the user types their email, receives a
// 6-digit code, and types it back. No network and no React here, so it is unit tested.
export const CODE_LENGTH = 6;
// Must match "Email OTP expiration" in the Supabase dashboard (Authentication > Providers > Email).
export const CODE_TTL_SECONDS = 600;
// Supabase allows one code per email per 60 seconds by default.
export const RESEND_COOLDOWN_SECONDS = 60;
export const PENDING_KEY = "fitrank.signin.pending";

export const normalizeEmail = (input: string) => input.trim().toLowerCase();
export const isValidEmail = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
// Digits only, so pasted codes with spaces or dashes ("123 456") still work.
export const cleanCode = (input: string) => input.replace(/\D/g, "").slice(0, CODE_LENGTH);
export const isCompleteCode = (code: string) => new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code);

export const secondsSince = (sentAt: number, now: number) => Math.max(0, (now - sentAt) / 1000);
export const isExpired = (sentAt: number, now: number) => secondsSince(sentAt, now) >= CODE_TTL_SECONDS;
export const secondsUntilResend = (sentAt: number, now: number) => Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSince(sentAt, now)));

// What we remember so the code screen survives iOS reloading the installed app while the
// user is in Mail. It holds no code and no token, only the address and when we sent.
export type Pending = { email: string; sentAt: number };
type PendingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function loadPending(storage: Pick<Storage, "getItem">, now: number): Pending | null {
  try {
    const parsed = JSON.parse(storage.getItem(PENDING_KEY) ?? "null");
    if (typeof parsed?.email !== "string" || !Number.isFinite(parsed?.sentAt)) return null;
    if (!isValidEmail(parsed.email) || isExpired(parsed.sentAt, now) || parsed.sentAt > now + 60_000) return null;
    return { email: parsed.email, sentAt: parsed.sentAt };
  } catch { return null; }
}
export function savePending(storage: PendingStorage, pending: Pending): void {
  try { storage.setItem(PENDING_KEY, JSON.stringify(pending)); } catch { /* sign-in still works; the code screen just won't survive a reload */ }
}
export function clearPending(storage: PendingStorage): void {
  try { storage.removeItem(PENDING_KEY); } catch { /* nothing to clear */ }
}

// The shape of a Supabase auth error, without importing the library.
export type AuthFailure = { message?: string; code?: string; status?: number; name?: string } | null | undefined;
const codeOf = (error: AuthFailure) => error?.code ?? "";
const isNetwork = (error: AuthFailure) => error?.name === "AuthRetryableFetchError" || (error?.status === 0) || (error?.status === undefined && /fetch|network/i.test(error?.message ?? ""));
const isRateLimited = (error: AuthFailure) => error?.status === 429 || /rate_limit/.test(codeOf(error));

export const NETWORK_MESSAGE = "Couldn’t reach FitRank. Check your connection and try again.";
export const RATE_LIMIT_MESSAGE = "Too many codes requested. Wait a few minutes and try again.";
export const EXPIRED_MESSAGE = "That code has expired. Send a new one.";
export const WRONG_CODE_MESSAGE = "That code isn’t right. Check the newest email and try again.";

export function sendErrorMessage(error: AuthFailure): string {
  if (isNetwork(error)) return NETWORK_MESSAGE;
  if (isRateLimited(error)) return RATE_LIMIT_MESSAGE;
  if (codeOf(error) === "email_address_not_authorized") return "This email can’t receive codes yet while FitRank is being tested.";
  if (["validation_failed", "email_address_invalid"].includes(codeOf(error))) return "Enter a valid email address.";
  if (["signup_disabled", "email_provider_disabled"].includes(codeOf(error))) return "Email sign-in isn’t available right now.";
  return "Couldn’t send a code. Try again in a moment.";
}

// Supabase answers "expired" and "wrong" with the same error, so our own timer decides which to show.
export function verifyErrorMessage(error: AuthFailure, sentAt: number, now: number): string {
  if (isNetwork(error)) return NETWORK_MESSAGE;
  if (isRateLimited(error)) return "Too many attempts. Wait a few minutes and try again.";
  const rejectedCode = codeOf(error) === "otp_expired" || [400, 401, 403, 422].includes(error?.status ?? 0) || /expired|invalid/i.test(error?.message ?? "");
  if (rejectedCode) return isExpired(sentAt, now) ? EXPIRED_MESSAGE : WRONG_CODE_MESSAGE;
  return "Couldn’t sign in. Try again in a moment.";
}
