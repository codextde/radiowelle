#!/usr/bin/env node
// Curation helper: search the cached radio-browser dump for candidate entries.
//
//   node scripts/stations/find.mjs "bayern 3"            # name contains (case-insensitive)
//   node scripts/stations/find.mjs "/^bayern ?3$/i"      # regex on name
//   node scripts/stations/find.mjs "url:br-mcdn"          # substring of url / url_resolved
//   node scripts/stations/find.mjs "home:antenne.de"      # substring of homepage
//   node scripts/stations/find.mjs ... --all              # include stations whose last check failed
//
// The dump is written by build.mjs (or `node scripts/stations/find.mjs --refresh`).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadRadioBrowser } from './lib/radiobrowser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const all = args.includes('--all');
const refresh = args.includes('--refresh');
const queries = args.filter((a) => !a.startsWith("--"));
const limit = Number((args.find((a) => a.startsWith("--n=")) || "--n=40").slice(4));

const stations = await loadRadioBrowser({ refresh, cacheDir: path.join(here, '.cache') });

function matcher(q) {
  if (q.startsWith('url:')) {
    const s = q.slice(4).toLowerCase();
    return (st) => (st.url + ' ' + st.url_resolved).toLowerCase().includes(s);
  }
  if (q.startsWith('home:')) {
    const s = q.slice(5).toLowerCase();
    return (st) => (st.homepage || '').toLowerCase().includes(s);
  }
  if (q.startsWith('id:')) {
    const s = q.slice(3).toLowerCase();
    return (st) => st.stationuuid.startsWith(s);
  }
  const m = q.match(/^\/(.*)\/([a-z]*)$/);
  if (m) {
    const re = new RegExp(m[1], m[2]);
    return (st) => re.test(st.name.trim());
  }
  const s = q.toLowerCase();
  return (st) => st.name.toLowerCase().includes(s);
}

for (const q of queries) {
  const fn = matcher(q);
  const hits = stations
    .filter((s) => fn(s) && (all || s.lastcheckok === 1))
    .sort((a, b) => b.clickcount - a.clickcount || b.votes - a.votes);
  console.log(`\n=== ${q}  (${hits.length})`);
  for (const s of hits.slice(0, limit)) {
    console.log(
      [
        s.stationuuid.slice(0, 8),
        s.lastcheckok ? 'ok ' : 'BAD',
        `${s.codec}/${s.bitrate}`.padEnd(9),
        `c${s.clickcount}`.padEnd(6),
        `v${s.votes}`.padEnd(7),
        JSON.stringify(s.name.trim()).padEnd(36),
        /[?&](token|sid|sABC|cid|t302|uuid|aw_0_1st|amsparams)=/i.test(s.url_resolved) ? '[u] ' + s.url : s.url_resolved,
      ].join(' '),
    );
    if (process.env.V) console.log('        home:', s.homepage, ' fav:', s.favicon, ' state:', s.state, s.countrycode);
  }
}
