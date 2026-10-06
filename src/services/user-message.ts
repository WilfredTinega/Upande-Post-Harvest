import { isAxiosError } from 'axios';
import { HttpError } from './api';

/**
 * Turn any error into text an operator can be shown.
 *
 * Messages a server raised for people (`frappe.throw("Bucket X is already in
 * use")`) pass through. Anything technical — stack traces, exception class
 * names, HTTP/axios/JS runtime text, HTML or JSON — is replaced by a plain
 * message chosen from what kind of failure it was, or by `fallback`.
 */
export function userMessage(err: unknown, fallback: string): string {
  const status = statusOf(err);
  if (isConnectionFailure(err, status)) return 'Could not reach the server. Check the connection and try again.';
  if (status === 401) return 'Your session has expired. Sign in again.';
  if (status === 403) return 'You are not allowed to do this.';
  if (status >= 500) return 'The server ran into a problem. Try again.';

  const text = humanText(rawText(err));
  return text ?? fallback;
}

/** `text` if it reads as a sentence meant for people, otherwise null. */
export function humanText(text: string | null | undefined): string | null {
  if (typeof text !== 'string') return null;
  if (/^\s*[{[<]/.test(text)) return null; // JSON or an HTML error page
  const cleaned = text
    // "frappe.exceptions.ValidationError: Bucket is in use" → "Bucket is in use"
    .replace(/^\s*(?:[\w.]+\.)?[A-Z]\w*(?:Error|Exception)\s*:\s*/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || cleaned.length > 240) return null;
  if (TECHNICAL.some((re) => re.test(cleaned))) return null;
  return cleaned;
}

const TECHNICAL: RegExp[] = [
  /traceback|stack ?trace|\bat \S+ \(|File ".*", line \d+/i,
  /^[\w.]*(?:Error|Exception)$/, // a bare exception class name
  /\b(?:Type|Reference|Syntax|Range)Error\b/,
  /request failed with status code|status code \d{3}/i,
  /network error|failed to fetch|timeout of \d+ms|ECONN\w+|ETIMEDOUT|ENOTFOUND|socket hang up|request aborted/i,
  /undefined|null is not|\[object |is not a function|cannot read propert|unexpected token|JSON\b/i,
  /not whitelisted|has no attribute|no module named|failed to get method|pymysql|OperationalError|\bSQL\b/i,
  /bad gateway|service unavailable|gateway time-?out|internal server error/i,
  /https?:\/\//i,
];

function statusOf(err: unknown): number {
  if (err instanceof HttpError) return err.status;
  if (isAxiosError(err)) return err.response?.status ?? 0;
  return 0;
}

function isConnectionFailure(err: unknown, status: number): boolean {
  if (isAxiosError(err)) return !err.response;
  // mapAxiosError's offline HttpError carries no body and says so.
  if (err instanceof HttpError) return status === 0 && err.body == null && /offline/i.test(err.message);
  return false;
}

function rawText(err: unknown): string | null {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return null;
}
