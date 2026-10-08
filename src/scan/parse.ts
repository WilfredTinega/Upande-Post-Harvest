/**
 * Parsers for the labels scanned in the packhouse.
 *
 *   bucket: {"bucket_id": "BUCKET-00123", ...}
 *   bunch:  {"bunch_id": "...", "variety": "...", "farm": "...", "stem_length": "...", "bunch_size": "Bunch (10)"}
 *   employee: {"grader"|"packer"|"harvester"|"employee": "HR-EMP-0001"}  (or the plain employee id)
 *   truck:  {"truck": "KDA 123A"}
 *   OPL:    https://<site>/app/order-pick-list/<OPL id>
 *   box:    BOX-... / CBL-...  (plain text)
 */

const MOJIBAKE: Record<string, string> = {
  'Ã©': 'é', 'Ã¨': 'è', 'Ãª': 'ê', 'Ã«': 'ë',
  'Ã¡': 'á', 'Ã ': 'à', 'Ã¢': 'â', 'Ã£': 'ã',
  'Ã¤': 'ä', 'Ã³': 'ó', 'Ã²': 'ò', 'Ã´': 'ô',
  'Ãµ': 'õ', 'Ã¶': 'ö', 'Ãº': 'ú', 'Ã¹': 'ù',
  'Ã»': 'û', 'Ã¼': 'ü', 'Ã±': 'ñ', 'Ã§': 'ç',
};

/** Undo UTF-8 read as Latin-1 (Honeywell wedge + accented variety names). */
export function fixMojibake(str: string): string {
  if (!str.includes('Ã') && !str.includes('Â')) return str;
  let fixed = str;
  for (const [wrong, right] of Object.entries(MOJIBAKE)) fixed = fixed.split(wrong).join(right);
  return fixed.replace(/Â(?![\x80-\xBF])/g, '');
}

function parseJson(raw: string): Record<string, any> | null {
  const text = fixMojibake(raw).trim();
  if (!text.startsWith('{') || !text.endsWith('}')) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export interface Bunch {
  bunch_id: string;
  variety: string;
  farm?: string;
  stem_length?: string;
  bunch_size?: string;
  [key: string]: unknown;
}

export function parseBunch(raw: string): Bunch | null {
  const data = parseJson(raw);
  if (!data || !data.bunch_id || !data.variety) return null;
  return data as Bunch;
}

/** Bucket id from a bucket QR. Accepts {"bucket_id": X} and the legacy {"X": "bucket"}. */
export function parseBucketId(raw: string): string | null {
  const data = parseJson(raw);
  if (!data) return null;
  const id = data.bucket_id ?? Object.keys(data).find((k) => data[k] === 'bucket');
  return id ? String(id).trim() : null;
}

/** Grader/packer/harvester id from an employee QR, or the plain id typed/scanned. */
export function parseEmployee(raw: string): string | null {
  const text = fixMojibake(raw).trim();
  if (text.startsWith('{')) {
    const data = parseJson(text);
    if (!data || data.bunch_id) return null;
    const id = data.grader ?? data.packer ?? data.harvester ?? data.employee;
    return id ? String(id).trim() : null;
  }
  return text || null;
}

/** The grader id on a grader badge QR ({"grader": X}); null for anything else. */
export function parseGraderQr(raw: string): string | null {
  const data = parseJson(raw);
  if (!data || data.bunch_id || !data.grader) return null;
  return String(data.grader).trim() || null;
}

export function parseTruck(raw: string): string | null {
  const data = parseJson(raw);
  return data?.truck ? String(data.truck).trim() : null;
}

export function isOplUrl(raw: string): boolean {
  return raw.includes('order-pick-list');
}

export function isBoxLabel(raw: string): boolean {
  const t = raw.trim();
  return t.startsWith('BOX') || t.startsWith('CBL');
}
