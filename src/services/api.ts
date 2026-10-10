import axios, {
  isAxiosError,
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { storage, StorageKeys } from './storage';
import { useNetworkStore } from '@/src/stores/networkStore';

/** Toggle to silence all API logs (e.g. in release builds). */
const LOG_ENABLED = true;
/** Truncate body previews to keep logs readable. */
const BODY_PREVIEW_LIMIT = 600;

// Attach a start timestamp to each request so the response interceptor can
// report elapsed milliseconds. Stored on the config under a typed key.
type TimedConfig = InternalAxiosRequestConfig & { __startedAt?: number };

function preview(value: unknown): string {
  if (value == null) return '';
  try {
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    return s.length > BODY_PREVIEW_LIMIT ? s.slice(0, BODY_PREVIEW_LIMIT) + '… (' + s.length + ' chars)' : s;
  } catch {
    return String(value);
  }
}

function methodOf(config: AxiosRequestConfig): string {
  return (config.method || 'GET').toUpperCase();
}

function urlOf(config: AxiosRequestConfig): string {
  // Don't print the full base URL on every line — show the path only.
  return config.url || '';
}

function logRequest(config: InternalAxiosRequestConfig): void {
  if (!LOG_ENABLED) return;
  const body = config.data ? preview(config.data) : '';
  console.log(`[API ▶] ${methodOf(config)} ${urlOf(config)}${body ? '  body=' + body : ''}`);
}

function logResponse(res: AxiosResponse, elapsedMs: number): void {
  if (!LOG_ENABLED) return;
  const inner: any = res.data;
  // Surface soft-errors visibly in logs (HTTP 200 with {data:{error}}).
  const softError =
    inner && typeof inner === 'object'
      ? (inner.error as string | undefined) ||
        (inner.data && typeof inner.data === 'object' ? inner.data.error : undefined)
      : undefined;
  const marker = softError ? '⚠' : '◀';
  console.log(
    `[API ${marker}] ${methodOf(res.config)} ${urlOf(res.config)} → ${res.status} in ${elapsedMs}ms${
      softError ? '  softError=' + JSON.stringify(softError) : ''
    }  body=${preview(res.data)}`,
  );
}

function logError(err: AxiosError, elapsedMs: number): void {
  if (!LOG_ENABLED) return;
  const status = err.response?.status ?? 0;
  const url = err.config ? urlOf(err.config) : '(no url)';
  const method = err.config ? methodOf(err.config) : '?';
  const body = err.response?.data ? preview(err.response.data) : err.message;
  console.log(`[API ✗] ${method} ${url} → ${status || 'network'} in ${elapsedMs}ms  ${body}`);
}

let client: AxiosInstance | null = null;

/** In-flight silent reauth, shared so a burst of simultaneously-expired requests
 *  triggers exactly ONE re-login; each awaits it, then retries. */
let reauthInFlight: Promise<boolean> | null = null;
/** True while a reauth runs — the re-login it performs must not itself trigger
 *  another reauth (would deadlock awaiting its own shared promise). */
let reauthenticating = false;

function reauthOnce(): Promise<boolean> {
  if (!reauthInFlight) {
    reauthInFlight = (async () => {
      reauthenticating = true;
      try {
        // Dynamic import breaks the api ↔ auth-api ↔ authStore require cycle.
        const { reauthenticate } = await import('./auth-api');
        return await reauthenticate();
      } catch {
        return false;
      } finally {
        reauthenticating = false;
      }
    })();
    reauthInFlight.finally(() => {
      reauthInFlight = null;
    });
  }
  return reauthInFlight;
}

/** A response meaning "your session is gone" vs a genuine permission denial.
 *  Frappe downgrades an expired-sid request to Guest and returns 403 with a
 *  `session_expired` flag (NOT 401), so we key on that flag — matching only the
 *  bare status would miss expiries or loop on legitimate 403s. */
function isSessionExpired(err: AxiosError): boolean {
  const res = err.response;
  if (!res) return false;
  if (res.status === 401) return true;
  if (res.status === 403) {
    const body = res.data as { session_expired?: unknown; exc_type?: string } | null;
    return !!(body && (body.session_expired || body.exc_type === 'AuthenticationError'));
  }
  return false;
}

type RetryableConfig = AxiosRequestConfig & { _reauthRetry?: boolean };

function buildClient(): AxiosInstance {
  const instance = axios.create({ timeout: 30000 });

  instance.interceptors.request.use(async (config) => {
    const baseUrl = await storage.get(StorageKeys.instanceUrl);
    if (baseUrl) config.baseURL = baseUrl;
    config.headers = config.headers ?? {};
    // Session-cookie auth. When the server expires the session (403
    // session_expired), the response interceptor silently re-logs-in with the
    // stored password and retries, so the user isn't bounced to the login screen.
    const cookie = await storage.get(StorageKeys.cookie);
    if (cookie) (config.headers as Record<string, string>).Cookie = cookie;
    if (!config.headers['Content-Type']) {
      (config.headers as Record<string, string>)['Content-Type'] = 'application/json';
    }
    (config as TimedConfig).__startedAt = Date.now();
    logRequest(config);
    return config;
  });

  instance.interceptors.response.use(
    (response) => {
      const started = (response.config as TimedConfig).__startedAt ?? Date.now();
      logResponse(response, Date.now() - started);
      // Reaching this branch means the server answered — we're online.
      try { useNetworkStore.getState().notifyApiSuccess(); } catch {}
      return response;
    },
    async (error: AxiosError) => {
      const started = (error.config as TimedConfig | undefined)?.__startedAt ?? Date.now();
      logError(error, Date.now() - started);
      // No response means the request never landed — likely a network problem.
      if (!error.response) {
        try { useNetworkStore.getState().notifyApiFailure(); } catch {}
        return Promise.reject(error);
      }
      // Expired session → silently re-login with the stored password and retry
      // the request ONCE. _reauthRetry guards against a reauth-then-401 loop;
      // `reauthenticating` stops the re-login's own calls from recursing.
      const cfg = error.config as RetryableConfig | undefined;
      if (cfg && !cfg._reauthRetry && !reauthenticating && isSessionExpired(error)) {
        const ok = await reauthOnce();
        if (ok) {
          cfg._reauthRetry = true;
          return instance.request(cfg);
        }
        // The stored password didn't get back in (changed, or no connection): back to
        // the login screen, keeping the server and email for the next sign-in.
        try {
          const { useAuthStore } = await import('@/src/stores/authStore');
          await useAuthStore.getState().logout();
        } catch {}
      }
      return Promise.reject(error);
    },
  );

  return instance;
}

export function apiClient(): AxiosInstance {
  if (!client) client = buildClient();
  return client;
}

/**
 * Thin wrapper that returns `response.data` and surfaces server-side soft
 * errors. Frappe's safe-exec sandbox can't set `frappe.response.http_status_code`,
 * so server scripts return HTTP 200 with `{ data: { error: "..." } }` on
 * domain failures — we promote that to a thrown HttpError here.
 */
export async function api<T = unknown>(config: AxiosRequestConfig): Promise<T> {
  const res = await apiClient().request<T>(config);
  const body: any = res.data;
  if (body && typeof body === 'object') {
    const inner = body.data && typeof body.data === 'object' ? body.data : body;
    // Only treat the response as failed when there is an explicit error signal
    // (never on a success `message`), but surface the richest reason available.
    const hasError =
      (typeof inner?.error === 'string' && inner.error) ||
      (typeof body.error === 'string' && body.error) ||
      typeof body.exc_type === 'string';
    if (hasError) {
      const reason = extractServerMessage(body) ?? String(inner?.error ?? body.error ?? 'Request failed');
      throw new HttpError(res.status || 200, reason, body);
    }
  }
  return res.data as T;
}

export class HttpError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** A connectivity failure — request never reached the server. */
function isNetworkError(err: AxiosError): boolean {
  if (err.response) return false; // server did respond
  if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') return true;
  // Axios in RN uses 'Network Error' as the message for fetch-level failures.
  if (typeof err.message === 'string' && /network\s*error|failed to fetch|timeout/i.test(err.message)) {
    return true;
  }
  return false;
}

/** Strip HTML tags/entities from a Frappe message for plain-text display. */
function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<li>/gi, ' • ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pull the most specific human-readable reason out of a Frappe error body.
 * Order: `_server_messages` (the message a `frappe.throw` raised) → top-level
 * `error` (set by server scripts) → nested `data.error` → generic `message` →
 * `exc_type`. This is why a failed transaction can show the real reason
 * ("Bucket X is already in use") instead of a generic "failed".
 */
export function extractServerMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as {
    _server_messages?: string;
    error?: string;
    message?: string;
    exc_type?: string;
    data?: { error?: string };
  };
  if (typeof b._server_messages === 'string' && b._server_messages) {
    try {
      const arr = JSON.parse(b._server_messages) as string[];
      const parsed = arr.map((s) => {
        try {
          return JSON.parse(s) as { message?: string; raise_exception?: number };
        } catch {
          return { message: s };
        }
      });
      // Prefer the entry that was actually raised as an exception.
      const chosen = parsed.find((o) => o.raise_exception) ?? parsed[parsed.length - 1];
      const msg = chosen?.message ? stripHtml(String(chosen.message)) : '';
      if (msg) return msg;
    } catch {
      // fall through to the plainer fields
    }
  }
  if (typeof b.error === 'string' && b.error) return b.error;
  if (b.data?.error) return b.data.error;
  if (typeof b.message === 'string' && b.message) return b.message;
  if (typeof b.exc_type === 'string') return b.exc_type;
  return undefined;
}

export function mapAxiosError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (isAxiosError(err)) {
    if (isNetworkError(err)) {
      return new HttpError(
        0,
        "You're offline. Check your network connection and try again.",
        null,
      );
    }
    const status = err.response?.status ?? 0;
    const body = err.response?.data;
    const message = extractServerMessage(body) ?? err.message;
    return new HttpError(status, message, body);
  }
  return new HttpError(0, err instanceof Error ? err.message : 'Unknown error', null);
}
