import axios from 'axios';
import { storage, StorageKeys } from './storage';
import { endpoint } from './api-module';
import { probeBaseUrl } from './url';
import { humanText } from './user-message';

function extractError(data: any): string | null {
  if (data && typeof data === 'object') {
    const m = data.message ?? data.exception;
    if (typeof m === 'string') return m;
  }
  return null;
}

export interface LoginResult {
  baseUrl: string;
  userId: string;
  email: string;
  fullName: string | null;
}

/**
 * Logs in with the stock /api/method/login, then reads the sid back from the
 * `auth.mobile_login` endpoint — on mobile the login Set-Cookie header is
 * absorbed by the native cookie store, which sends it on the follow-up call.
 * Persists the sid + instance URL + credentials for silent re-login.
 */
export async function loginToServer(bareUrl: string, email: string, password: string): Promise<LoginResult> {
  const baseUrl = await probeBaseUrl(bareUrl);

  const login = await axios.post(
    `${baseUrl}/api/method/login`,
    { usr: email, pwd: password },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000, validateStatus: () => true },
  );
  if (login.status === 401 || login.status === 403) {
    throw new Error('Invalid email or password.');
  }
  if (login.status < 200 || login.status >= 300) {
    throw new Error(humanText(extractError(login.data)) ?? 'Could not sign in. Try again.');
  }

  const route = endpoint('auth.mobile_login');
  const res = await axios.post(`${baseUrl}${route.path}`, route.args, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
    validateStatus: () => true,
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('Invalid email or password.');
  }
  if (res.status === 404) {
    throw new Error('This server does not support the Upande Post Harvest app.');
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(humanText(extractError(res.data)) ?? 'Could not sign in. Try again.');
  }

  const msg: any = (res.data && ((res.data as any).message ?? res.data)) || {};
  const sid = msg.sid as string | undefined;
  const userId = (msg.user_id as string) ?? email;
  if (!sid) throw new Error('Login succeeded but no session was returned.');

  await storage.set(StorageKeys.instanceUrl, baseUrl);
  await storage.set(StorageKeys.instanceUrlBackup, baseUrl);
  await storage.set(StorageKeys.cookie, `sid=${sid}; user_id=${userId}`);
  await storage.set(StorageKeys.emailBackup, email);
  // Kept in the secure enclave so an expired session can be silently recovered.
  await storage.set(StorageKeys.passwordBackup, password);
  if (msg.full_name) await storage.set(StorageKeys.fullName, String(msg.full_name));

  return { baseUrl, userId, email, fullName: msg.full_name ?? null };
}

/**
 * Silently recover an expired session: re-login with the stored password so the
 * in-flight request can retry. Returns false when credentials are missing or
 * login fails.
 */
export async function reauthenticate(): Promise<boolean> {
  const [email, password, url] = await Promise.all([
    storage.get(StorageKeys.emailBackup),
    storage.get(StorageKeys.passwordBackup),
    storage.get(StorageKeys.instanceUrlBackup),
  ]);
  if (!email || !password || !url) return false;
  try {
    await loginToServer(url, email, password);
    return true;
  } catch {
    return false;
  }
}
