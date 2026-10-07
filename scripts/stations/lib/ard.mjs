// Square station logos of ARD / Deutschlandradio livestreams from the public ARD Audiothek GraphQL API.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { USER_AGENT } from './radiobrowser.mjs';

const QUERY = '{permanentLivestreams(first:400){nodes{title image{url1X1}}}}';

/** @returns {Promise<Map<string,string>>} livestream title -> 512px square image URL */
export async function loadArdLogos({ cacheDir, maxAgeHours = 24 * 7 } = {}) {
  const file = path.join(cacheDir, 'ard-livestreams.json');
  let nodes = null;
  try {
    const s = await stat(file);
    if (Date.now() - s.mtimeMs < maxAgeHours * 3600_000) nodes = JSON.parse(await readFile(file, 'utf8'));
  } catch {}
  if (!nodes) {
    try {
      const res = await fetch(`https://api.ardaudiothek.de/graphql?query=${encodeURIComponent(QUERY)}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
      const json = await res.json();
      nodes = json?.data?.permanentLivestreams?.nodes || [];
      await mkdir(cacheDir, { recursive: true });
      await writeFile(file, JSON.stringify(nodes));
    } catch (err) {
      console.warn(`[ard] could not load ARD Audiothek livestreams: ${err.message}`);
      nodes = [];
    }
  }
  const map = new Map();
  for (const n of nodes) {
    const u = n?.image?.url1X1;
    if (n?.title && u) map.set(n.title.trim(), u.replace('{width}', '512'));
  }
  return map;
}
