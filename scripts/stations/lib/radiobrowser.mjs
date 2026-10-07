// Minimal radio-browser.info client with mirror fallback and an on-disk cache.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const USER_AGENT = 'Radiowelle/1.0 (catalog build; codext.de)';
export const MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
];

export async function rbFetch(apiPath, { timeoutMs = 60_000 } = {}) {
  let lastErr;
  for (const base of MIRRORS) {
    try {
      const res = await fetch(base + apiPath, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      console.warn(`[radio-browser] ${base}${apiPath} failed: ${err.message}`);
    }
  }
  throw lastErr;
}

/**
 * Loads all German stations (cached in cacheDir/de-all.json).
 * The dump is refreshed when `refresh` is set or when it is older than maxAgeHours.
 */
export async function loadRadioBrowser({ cacheDir, refresh = false, maxAgeHours = 24 * 7 } = {}) {
  const file = path.join(cacheDir, 'de-all.json');
  let fresh = false;
  try {
    const s = await stat(file);
    fresh = Date.now() - s.mtimeMs < maxAgeHours * 3600_000;
  } catch {}
  if (refresh || !fresh) {
    console.log('[radio-browser] downloading German station list ...');
    const data = await rbFetch('/json/stations/bycountrycodeexact/DE?hidebroken=false&limit=100000', {
      timeoutMs: 180_000,
    });
    await mkdir(cacheDir, { recursive: true });
    await writeFile(file, JSON.stringify(data));
    return data;
  }
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function fetchByUuids(uuids) {
  const out = [];
  for (let i = 0; i < uuids.length; i += 50) {
    const chunk = uuids.slice(i, i + 50);
    out.push(...(await rbFetch(`/json/stations/byuuid?uuids=${chunk.join(',')}`)));
  }
  return out;
}
