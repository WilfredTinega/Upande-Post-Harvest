import axios from 'axios';

/**
 * The server part of what was typed or pasted: no scheme, path, query or spaces.
 * "https://tambuzi.upande.com/app/home?x=1 " -> { host: "tambuzi.upande.com", scheme: "https" }.
 * A pasted browser link (…/app, …/login) is the common way to get this wrong.
 */
export function serverAddress(rawUrl: string): { host: string; scheme: 'http' | 'https' | null } {
  let text = rawUrl.trim().replace(/\s+/g, '');
  let scheme: 'http' | 'https' | null = null;
  const m = /^(https?):\/\//i.exec(text);
  if (m) {
    scheme = m[1].toLowerCase() as 'http' | 'https';
    text = text.slice(m[0].length);
  }
  const host = text.split(/[/?#]/)[0].replace(/\.+$/, '').toLowerCase();
  return { host, scheme };
}

/**
 * Resolve a server address to a full base URL. A scheme typed or pasted is kept;
 * otherwise a LAN / local dev server (IP address, localhost or an explicit port)
 * runs plain http, and anything else HTTPS when it answers, else http.
 */
export async function probeBaseUrl(rawUrl: string): Promise<string> {
  const { host, scheme } = serverAddress(rawUrl);
  if (!host) throw new Error('Instance URL is required.');
  if (scheme) return `${scheme}://${host}`;
  if (isLocalAddress(host)) return `http://${host}`;

  const httpsUrl = `https://${host}`;
  try {
    // Any answer over HTTPS (even 404/405 for HEAD) means HTTPS works.
    await axios.head(httpsUrl, { timeout: 5000, validateStatus: () => true });
    return httpsUrl;
  } catch {
    return `http://${host}`;
  }
}

function isLocalAddress(host: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(host) || /^localhost(:\d+)?$/i.test(host) || /:\d+$/.test(host);
}

/** Frappe's ping answers {"message": "pong"}; tolerate a body left as text. */
function isPong(data: unknown): boolean {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)?.message === 'pong';
    } catch {
      return false;
    }
  }
  return (data as { message?: unknown } | null)?.message === 'pong';
}

/**
 * Resolve a typed server address and confirm an ERPNext (Frappe) site answers on it,
 * trying HTTPS and then http unless a scheme was given. Returns the full base URL;
 * throws with a message fit for the login screen.
 */
export async function verifyServer(rawUrl: string): Promise<string> {
  const { host, scheme } = serverAddress(rawUrl);
  if (!host) throw new Error('Enter the server address.');
  const schemes: ('http' | 'https')[] = scheme ? [scheme] : isLocalAddress(host) ? ['http'] : ['https', 'http'];
  let answered: number | null = null;
  for (const s of schemes) {
    const baseUrl = `${s}://${host}`;
    try {
      const res = await axios.get(`${baseUrl}/api/method/ping`, { timeout: 15000, validateStatus: () => true });
      if (res.status === 200 && isPong(res.data)) return baseUrl;
      answered = answered ?? res.status;
    } catch {
      // Not reachable this way; try the next scheme.
    }
  }
  if (answered === null) {
    throw new Error(`Could not reach ${host}. Check the address and the phone's internet.`);
  }
  throw new Error(`${host} is not an ERPNext server (HTTP ${answered}). Enter just the server name, e.g. tambuzi.upande.com.`);
}
