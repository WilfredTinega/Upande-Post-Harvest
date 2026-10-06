import axios from 'axios';

/**
 * Resolve a bare hostname (e.g. "kaitet-group.upande.com") to a full base URL.
 * Tries HTTPS first via a HEAD probe; falls back to HTTP if HTTPS is unreachable.
 * If the input already has a scheme, returns it trimmed.
 */
export async function probeBaseUrl(rawUrl: string): Promise<string> {
  const trimmed = rawUrl.trim().replace(/\s+/g, '').replace(/\/+$/, '');
  if (!trimmed) throw new Error('Instance URL is required.');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  // A LAN / local dev server (IP address, localhost or an explicit port) runs plain http.
  if (isLocalAddress(trimmed)) return `http://${trimmed}`;

  const httpsUrl = `https://${trimmed}`;
  try {
    // Any answer over HTTPS (even 404/405 for HEAD) means HTTPS works.
    await axios.head(httpsUrl, { timeout: 5000, validateStatus: () => true });
    return httpsUrl;
  } catch {
    return `http://${trimmed}`;
  }
}

function isLocalAddress(host: string): boolean {
  const name = host.split('/')[0];
  return (
    /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(name) ||
    /^localhost(:\d+)?$/i.test(name) ||
    /:\d+$/.test(name)
  );
}

/**
 * Resolve a typed server address and confirm a Frappe site answers on it.
 * Returns the full base URL; throws with a message fit for the login screen.
 */
export async function verifyServer(rawUrl: string): Promise<string> {
  const baseUrl = await probeBaseUrl(rawUrl);
  let res;
  try {
    res = await axios.get(`${baseUrl}/api/method/ping`, { timeout: 15000, validateStatus: () => true });
  } catch {
    throw new Error('Could not reach this server.');
  }
  if (res.status !== 200 || (res.data as any)?.message !== 'pong') {
    throw new Error('This address is not a Post Harvest server.');
  }
  return baseUrl;
}
