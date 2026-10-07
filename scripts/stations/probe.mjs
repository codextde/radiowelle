#!/usr/bin/env node
// Curation helper: probe one or more stream URLs in parallel.
//   node scripts/stations/probe.mjs <url> [url ...]
import { probe, pool } from './lib/probe.mjs';

const urls = process.argv.slice(2);
await pool(urls, 12, async (u) => {
  const r = await probe(u, { attempts: 1 });
  console.log(
    r.ok ? 'OK  ' : 'FAIL',
    (r.codec || '-').padEnd(4),
    String(r.bitrate ?? '-').padEnd(4),
    r.icy ? 'icy' : '   ',
    r.hls ? 'hls' : '   ',
    u,
    r.ok ? `[${r.icyName ?? ''}]` : `-> ${r.reason}`,
  );
});
