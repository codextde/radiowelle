#!/usr/bin/env node
/**
 * Builds the bundled German station catalog for Radiowelle.
 *
 *   node scripts/stations/build.mjs                 # full build (uses cached radio-browser dump < 7 days old)
 *   node scripts/stations/build.mjs --refresh       # re-download the radio-browser dump first
 *   node scripts/stations/build.mjs --only=1live,swr3   # dry run for a few ids (prints, writes nothing)
 *   node scripts/stations/build.mjs --no-logos      # skip logo processing (keeps existing logo fields)
 *
 * Inputs : scripts/stations/curated.json  (ordered by curated popularity – the order IS the rank)
 * Outputs: src/data/stations-de.json, assets/logos/de/<id>.webp, scripts/stations/report.md
 *
 * Every stream is verified (GET + Icy-MetaData, 8 s timeout, first 16 KB). A URL that fails twice is
 * abandoned; the next candidate (explicit `alt` URLs, then matching radio-browser entries) is tried.
 * Stations without any working stream are dropped and listed in the report.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchByUuids, loadRadioBrowser } from './lib/radiobrowser.mjs';
import { pool, probe } from './lib/probe.mjs';
import { loadArdLogos } from './lib/ard.mjs';
import {
  homepageIconCandidates,
  isBadUrl,
  loadImage,
  normaliseLogo,
  scoreCandidate,
  setCacheDir,
  sha1,
} from './lib/logo.mjs';

const execFileP = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const CACHE = path.join(HERE, '.cache');
const OUT_JSON = path.join(ROOT, 'src/data/stations-de.json');
const LOGO_DIR = path.join(ROOT, 'assets/logos/de');
const REPORT = path.join(HERE, 'report.md');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const ONLY = opt('only')?.split(',').filter(Boolean);
const DRY = !!ONLY;
const NO_LOGOS = flag('no-logos');
const CONCURRENCY = Number(opt('concurrency') || 10);

const GENRES = new Set(
  'pop charts rock alternative metal electronic dance hiphop rnb schlager volksmusik oldies 80s 90s classical jazz chill news talk culture kids sport christian country latin world regional'.split(
    ' ',
  ),
);
const NETWORKS = new Set(['ARD', 'Deutschlandradio', 'Private', 'Webradio', 'Church']);
const STATES = {
  'DE-BW': 'Baden-Württemberg',
  'DE-BY': 'Bayern',
  'DE-BE': 'Berlin',
  'DE-BB': 'Brandenburg',
  'DE-HB': 'Bremen',
  'DE-HH': 'Hamburg',
  'DE-HE': 'Hessen',
  'DE-MV': 'Mecklenburg-Vorpommern',
  'DE-NI': 'Niedersachsen',
  'DE-NW': 'Nordrhein-Westfalen',
  'DE-RP': 'Rheinland-Pfalz',
  'DE-SL': 'Saarland',
  'DE-SN': 'Sachsen',
  'DE-ST': 'Sachsen-Anhalt',
  'DE-SH': 'Schleswig-Holstein',
  'DE-TH': 'Thüringen',
};

// ---------------------------------------------------------------------------------------------
// helpers

export function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, ' ')
    .replace(/\b(mp3|aacp?\+?|he-?aac|ogg|opus|flac|hq|lq|hd|\d{2,3}\s?k(bits?|bps)?|\d{2,3}\s?kbit\/?s?|kbps|https?|ssl)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

function normUrl(u) {
  return String(u || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

const TOKEN_RE = /[?&](token|sid|cid|sABC|t302|uuid|aw_0_1st\.skey|listenerid|amsparams|_art|sabcsid|tvf)=/i;
const EDGE_HOST_RE = /(^|\.)(f\d+|d\d+)\.rndfnk\.com$|streamabc\.net$|--cdn\.cast\.addradio\.de$|^edge\d+\./i;
const PLAYLIST_RE = /\.(m3u|pls|asx|xspf)(\?|$)|\/play\.(m3u|pls)|listen\.pls|tunein-[a-z0-9-]*pls/i;

function hostOf(u) {
  try {
    return new URL(u).hostname;
  } catch {
    return '';
  }
}

/** Picks the stable URL to use from a radio-browser entry. */
function stableUrl(st) {
  const url = (st.url || '').trim();
  const res = (st.url_resolved || '').trim() || url;
  const urlIsPlaylist = PLAYLIST_RE.test(url) && !/\.m3u8(\?|$)/i.test(url);
  if (urlIsPlaylist) return { url: res, tokenized: TOKEN_RE.test(res) || EDGE_HOST_RE.test(hostOf(res)) };
  if (res !== url && (TOKEN_RE.test(res) || EDGE_HOST_RE.test(hostOf(res)))) return { url, tokenized: TOKEN_RE.test(url) };
  return { url: res, tokenized: TOKEN_RE.test(res) };
}

function rbScore(st) {
  const { url, tokenized } = stableUrl(st);
  let s = st.lastcheckok ? 50 : -50;
  if (url.startsWith('https://')) s += 4;
  const codec = (st.codec || '').toUpperCase();
  if (codec === 'MP3') s += 4;
  else if (codec.startsWith('AAC')) s += 3;
  else if (!codec || codec === 'UNKNOWN') s += 1;
  const br = st.bitrate || 0;
  if (br >= 128 && br <= 192) s += 4;
  else if (br > 192 && br <= 320) s += 3;
  else if (br >= 96 && br < 128) s += 2;
  else if (br > 0 && br < 64) s -= 3;
  else if (br === 0) s += 1;
  if (st.hls) s -= 2;
  if (tokenized) s -= 40;
  const agg = url.match(/[?&]aggregator=([^&]+)/i);
  if (agg && !/^(web|radio-?browser)$/i.test(agg[1])) s -= 1;
  if (/\?.{60,}/.test(url)) s -= 2; // long tracking query strings
  s += Math.log10((st.votes || 0) + 1) + 1.5 * Math.log10((st.clickcount || 0) + 1);
  if (st.favicon) s += 1;
  return s;
}

function cleanHomepage(h) {
  if (!h) return null;
  h = h.trim();
  if (!h) return null;
  if (!/^https?:\/\//i.test(h)) h = 'https://' + h.replace(/^\/+/, '');
  try {
    const u = new URL(h);
    return u.toString();
  } catch {
    return null;
  }
}

function bitrateFromUrl(u) {
  const m = u.match(/(?:mp3|aac|aacp|ogg|opus)[-_/](\d{2,3})\b|\/(\d{2,3})\/(?:stream|mp3|aac)|[-_](\d{2,3})k?\.(?:mp3|aac)|bitrate=(\d{2,3})/i);
  const v = m && Number(m[1] || m[2] || m[3] || m[4]);
  return v && v >= 24 && v <= 320 ? v : null;
}

// ---------------------------------------------------------------------------------------------
// validate curated input

const curated = JSON.parse(await readFile(path.join(HERE, 'curated.json'), 'utf8'));
{
  const ids = new Set();
  const errs = [];
  for (const e of curated) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id)) errs.push(`${e.id}: bad id`);
    if (ids.has(e.id)) errs.push(`${e.id}: duplicate id`);
    ids.add(e.id);
    if (!e.name) errs.push(`${e.id}: missing name`);
    if (!NETWORKS.has(e.network)) errs.push(`${e.id}: bad network ${e.network}`);
    if (e.state !== null && !STATES[e.state]) errs.push(`${e.id}: bad state ${e.state}`);
    if (!Array.isArray(e.genres) || e.genres.length < 1 || e.genres.length > 3) errs.push(`${e.id}: 1-3 genres required`);
    for (const g of e.genres || []) if (!GENRES.has(g)) errs.push(`${e.id}: bad genre ${g}`);
    if (!e.tagline) errs.push(`${e.id}: missing tagline`);
    else if (e.tagline.length > 44) errs.push(`${e.id}: tagline too long (${e.tagline.length})`);
  }
  if (errs.length) {
    console.error('curated.json is invalid:\n  ' + errs.join('\n  '));
    process.exit(1);
  }
}

const active = curated.filter((e) => !e.skip);
const skipped = curated.filter((e) => e.skip);
const entries = ONLY ? active.filter((e) => ONLY.includes(e.id)) : active;
setCacheDir(CACHE);

// ---------------------------------------------------------------------------------------------
// radio-browser index

const rbAll = await loadRadioBrowser({ cacheDir: CACHE, refresh: flag('refresh') });
const pinned = entries.map((e) => e.rbId).filter(Boolean);
const known = new Set(rbAll.map((s) => s.stationuuid));
const missingPinned = pinned.filter((id) => !known.has(id));
if (missingPinned.length) rbAll.push(...(await fetchByUuids(missingPinned)));

const byName = new Map();
const byUrl = new Map();
for (const st of rbAll) {
  const n = normName(st.name);
  if (n) (byName.get(n) || byName.set(n, []).get(n)).push(st);
  for (const u of new Set([normUrl(st.url), normUrl(st.url_resolved)])) {
    if (u) (byUrl.get(u) || byUrl.set(u, []).get(u)).push(st);
  }
}

function resolveEntry(e) {
  const aliases = [e.name, ...(e.match || [])].map(normName);
  let named = [];
  for (const a of new Set(aliases)) named.push(...(byName.get(a) || []));
  if (e.urlHas) {
    const needles = [].concat(e.urlHas).map((x) => x.toLowerCase());
    const viaUrl = rbAll.filter((st) => needles.some((n) => (st.url + ' ' + st.url_resolved).toLowerCase().includes(n)));
    named = viaUrl;
  }
  if (e.rbId) named.unshift(...rbAll.filter((s) => s.stationuuid === e.rbId));
  named = [...new Map(named.map((s) => [s.stationuuid, s])).values()];
  named.sort((a, b) => rbScore(b) - rbScore(a));

  // stream candidates
  const cands = [];
  const seen = new Set();
  const add = (url, rb, origin) => {
    const k = normUrl(url) + (url.match(/\?.*$/)?.[0] || '');
    if (!url || seen.has(k)) return;
    seen.add(k);
    cands.push({ url, rb, origin });
  };
  for (const u of [].concat(e.url || [], e.alt || [])) {
    const exact = (byUrl.get(normUrl(u)) || []).sort((a, b) => rbScore(b) - rbScore(a));
    add(u, exact[0] || null, 'curated');
  }
  if (!e.noFallback || !e.url) {
    for (const st of named) {
      if (!st.lastcheckok && cands.length >= 1) continue;
      const { url, tokenized } = stableUrl(st);
      if (tokenized || !url) continue;
      add(url, st, 'radio-browser');
    }
  }
  return { named, cands: cands.slice(0, 4) };
}

// ---------------------------------------------------------------------------------------------
// stream verification

console.log(`Resolving & probing ${entries.length} stations ...`);
const results = await pool(entries, CONCURRENCY, async (e) => {
  const { named, cands } = resolveEntry(e);
  const tried = [];
  let ok = null;
  for (const c of cands) {
    const r = await probe(c.url, { attempts: 2, timeoutMs: 8000 });
    tried.push({ url: c.url, ok: r.ok, reason: r.reason, attempts: r.attempts });
    if (r.ok) {
      ok = { ...c, probe: r };
      break;
    }
  }
  // upgrade plain http to https when the same stream works over TLS
  if (ok && ok.url.startsWith('http://')) {
    const httpsUrl = 'https://' + ok.url.slice(7);
    const r = await probe(httpsUrl, { attempts: 1, timeoutMs: 8000 });
    if (r.ok && r.hls === ok.probe.hls) {
      tried.push({ url: httpsUrl, ok: true, note: 'https upgrade' });
      ok = { ...ok, url: httpsUrl, probe: { ...ok.probe, icy: ok.probe.icy || r.icy } };
    }
  }
  const tag = ok ? (ok.probe.icy ? 'OK icy' : 'OK    ') : 'DROP  ';
  console.log(`${tag} ${e.id.padEnd(28)} ${ok ? ok.url : tried.map((t) => t.reason).join(' | ') || 'no candidates'}`);
  return { e, named, ok, tried };
});

// ---------------------------------------------------------------------------------------------
// logos

let previous = [];
try {
  previous = JSON.parse(await readFile(OUT_JSON, 'utf8'));
} catch {}
const prevById = new Map(previous.map((s) => [s.id, s]));

const ardLogos = NO_LOGOS ? new Map() : await loadArdLogos({ cacheDir: CACHE });
for (const e of entries) if (e.ard && !ardLogos.has(e.ard)) console.warn(`[ard] no ARD Audiothek livestream titled "${e.ard}" (${e.id})`);

// Radio NRW local stations: favicons are tiny variants (<code>-37-NN.png) of a 300px logo (<code>-35-39.png)
const NRW_LOGO_RE = /(logos-der-nrwlokalradios\.s3[^/]*\/)([0-9a-f]{4})-(?:3[57])-\d+\.png/i;

async function processLogo(e, chosen, named, homepage) {
  const outFile = path.join(LOGO_DIR, `${e.id}.webp`);
  if (e.logo === null) return { logo: null, color: null, note: 'disabled in curated.json' };
  const cands = [];
  const push = (url, src, hint = 0) => {
    if (!url || !/^https?:\/\//.test(url)) return;
    if (cands.some((c) => c.url === url)) return;
    if (src !== 'override' && isBadUrl(url)) return;
    cands.push({ url: url.trim(), src, hint });
  };
  for (const u of [].concat(e.logo || [])) push(u, 'override');
  if (!e.logo && e.ard && ardLogos.get(e.ard)) push(ardLogos.get(e.ard), 'ard');
  if (!e.logo) {
    if (chosen?.favicon) push(chosen.favicon, 'favicon');
    for (const st of named.slice(0, 8)) if (st.favicon) push(st.favicon, 'favicon');
    for (const c of await homepageIconCandidates(homepage).catch(() => [])) push(c.url, c.src, c.hint);
    for (const c of [...cands]) {
      const m = c.url.match(NRW_LOGO_RE);
      if (m) push(`https://${m[1]}${m[2]}-35-39.png`, 'brand');
    }
  }
  const evaluated = [];
  for (const c of cands.slice(0, 14)) {
    const img = await loadImage(c.url);
    const sc = scoreCandidate(c, img);
    evaluated.push({ ...c, ...sc, w: img?.width, h: img?.height, img });
  }
  const good = evaluated.filter((c) => !c.reject).sort((a, b) => b.score - a.score);
  if (!good.length) {
    return {
      logo: null,
      color: null,
      note: evaluated.length ? evaluated.map((c) => `${c.src}: ${c.reject}`).slice(0, 4).join('; ') : 'no candidates',
    };
  }
  const best = good[0];
  const { webp, color, bg } = await normaliseLogo(best.img.buf, outFile, { trim: !!e.logoTrim && best.src === 'override', bg: e.logoBg });
  return {
    logo: `de/${e.id}.webp`,
    color: e.color !== undefined ? e.color : color,
    source: best.url,
    sourceKind: best.src,
    sourceSize: `${best.w}x${best.h}`,
    bytes: webp.length,
    hash: best.img.hash,
    photoLike: best.photoLike,
    bg,
  };
}

const live = results.filter((r) => r.ok);
let logos = new Map();
if (!NO_LOGOS) {
  console.log(`\nProcessing logos for ${live.length} stations ...`);
  await mkdir(LOGO_DIR, { recursive: true });
  const out = await pool(live, 6, async (r) => {
    const chosen = r.ok.rb || r.named[0] || null;
    const homepage = cleanHomepage(r.e.homepage || chosen?.homepage);
    let l;
    try {
      l = await processLogo(r.e, chosen, r.named, homepage);
    } catch (err) {
      l = { logo: null, color: null, note: `error: ${err.message}` };
    }
    console.log(`${l.logo ? 'LOGO' : 'NONE'} ${r.e.id.padEnd(28)} ${l.logo ? `${l.sourceKind} ${l.sourceSize} ${l.color ?? ''}` : l.note}`);
    return [r.e.id, l];
  });
  logos = new Map(out);
}

// ---------------------------------------------------------------------------------------------
// assemble

const stations = [];
let rank = 0;
for (const r of results) {
  if (!r.ok) continue;
  const { e, ok } = r;
  const chosen = ok.rb || r.named[0] || null;
  const l = NO_LOGOS ? prevById.get(e.id) || { logo: null, color: null } : logos.get(e.id);
  const codec = (ok.probe.codec || chosen?.codec || 'MP3').toUpperCase().replace(/^AAC\+?$/, 'AAC');
  const bitrate = ok.probe.bitrate || bitrateFromUrl(ok.url) || (chosen?.bitrate > 0 ? chosen.bitrate : null);
  stations.push({
    id: e.id,
    rbId: e.rbId || chosen?.stationuuid || null,
    name: e.name,
    tagline: e.tagline,
    url: ok.url,
    homepage: cleanHomepage(e.homepage || chosen?.homepage),
    logo: l?.logo ?? null,
    color: l?.color ?? null,
    country: 'DE',
    state: e.state,
    city: e.city ?? null,
    network: e.network,
    genres: e.genres,
    language: e.language || 'de',
    codec: codec === 'OGG' && /opus/i.test(ok.url) ? 'OPUS' : codec,
    bitrate,
    hls: !!ok.probe.hls,
    icy: !!ok.probe.icy,
    rank: ++rank,
  });
}

if (DRY) {
  for (const r of results) {
    const s = stations.find((x) => x.id === r.e.id);
    console.log('\n' + r.e.id, JSON.stringify(s, null, 1));
    console.log('  tried:', r.tried);
    console.log('  rb matches:', r.named.slice(0, 5).map((s) => `${s.stationuuid.slice(0, 8)} ${s.name} ${s.url_resolved}`));
    console.log('  icy-name:', r.ok?.probe.icyName);
    if (logos.get(r.e.id)) console.log('  logo:', logos.get(r.e.id));
  }
  process.exit(0);
}

// remove stale logos
for (const f of await readdir(LOGO_DIR).catch(() => [])) {
  const id = f.replace(/\.webp$/, '');
  if (!stations.some((s) => s.id === id && s.logo)) await rm(path.join(LOGO_DIR, f));
}

await mkdir(path.dirname(OUT_JSON), { recursive: true });
await writeFile(OUT_JSON, JSON.stringify(stations, null, 2) + '\n');

// review data for humans (not shipped)
const review = results.map((r) => ({
  id: r.e.id,
  name: r.e.name,
  url: r.ok?.url ?? null,
  icyName: r.ok?.probe.icyName ?? null,
  contentType: r.ok?.probe.contentType ?? null,
  rbName: r.ok?.rb?.name ?? r.named[0]?.name ?? null,
  tried: r.tried,
  logo: logos.get(r.e.id) ? { ...logos.get(r.e.id), img: undefined } : null,
}));
await writeFile(path.join(CACHE, 'review.json'), JSON.stringify(review, null, 2));

// contact sheet for visual logo QA (requires ImageMagick; optional)
try {
  const files = stations.filter((s) => s.logo).map((s) => path.join(ROOT, 'assets/logos', s.logo));
  const per = 80;
  for (let i = 0; i < files.length; i += per) {
    const chunk = files.slice(i, i + per);
    const font = existsSync('/System/Library/Fonts/Helvetica.ttc') ? ['-font', '/System/Library/Fonts/Helvetica.ttc'] : [];
    await execFileP('/opt/homebrew/bin/magick', [
      'montage',
      ...font,
      ...chunk.flatMap((f) => ['-label', path.basename(f, '.webp'), f]),
      '-background',
      '#888888',
      '-geometry',
      '128x128+6+6',
      '-tile',
      '10x',
      '-pointsize',
      '11',
      path.join(CACHE, `contact-${String(i / per + 1).padStart(2, '0')}.png`),
    ]);
  }
} catch {}

// ---------------------------------------------------------------------------------------------
// report

const dropped = results.filter((r) => !r.ok);
const noLogo = stations.filter((s) => !s.logo);
const lines = [];
lines.push('# Radiowelle – German station catalog build report', '');
lines.push(`Generated: ${new Date().toISOString()}  `);
lines.push(`Source: radio-browser.info (cached dump of ${rbAll.length} DE entries) + curated overrides in \`scripts/stations/curated.json\``, '');
lines.push('## Summary', '');
lines.push(`| Metric | Count |`, `|---|---|`);
lines.push(`| Curated candidates | ${active.length} (+${skipped.length} removed during curation) |`);
lines.push(`| Stations in catalog | ${stations.length} |`);
lines.push(`| Dropped (no working stream) | ${dropped.length} |`);
lines.push(`| With logo | ${stations.length - noLogo.length} (${Math.round(((stations.length - noLogo.length) / stations.length) * 100)}%) |`);
lines.push(`| With brand color | ${stations.filter((s) => s.color).length} |`);
lines.push(`| ICY metadata (live titles) | ${stations.filter((s) => s.icy).length} |`);
lines.push(`| HLS streams | ${stations.filter((s) => s.hls).length} |`);
lines.push(`| HTTPS streams | ${stations.filter((s) => s.url.startsWith('https://')).length} |`);
lines.push(`| Linked to radio-browser (rbId) | ${stations.filter((s) => s.rbId).length} |`, '');
const byNet = {};
for (const s of stations) byNet[s.network] = (byNet[s.network] || 0) + 1;
lines.push('### By network', '', '| Network | Stations |', '|---|---|');
for (const [k, v] of Object.entries(byNet).sort((a, b) => b[1] - a[1])) lines.push(`| ${k} | ${v} |`);
lines.push('');
const codecs = {};
for (const s of stations) codecs[`${s.codec}${s.hls ? ' (HLS)' : ''}`] = (codecs[`${s.codec}${s.hls ? ' (HLS)' : ''}`] || 0) + 1;
lines.push('### By codec', '', '| Codec | Stations |', '|---|---|');
for (const [k, v] of Object.entries(codecs).sort((a, b) => b[1] - a[1])) lines.push(`| ${k} | ${v} |`);
lines.push('');

lines.push('## Coverage per Bundesland', '');
lines.push('| Code | Bundesland | Stations | OK (>= 5) |', '|---|---|---|---|');
for (const [code, label] of Object.entries(STATES)) {
  const n = stations.filter((s) => s.state === code).length;
  lines.push(`| ${code} | ${label} | ${n} | ${n >= 5 ? 'yes' : '**NO**'} |`);
}
lines.push(`| – | National / webradio (state = null) | ${stations.filter((s) => !s.state).length} | |`, '');
for (const [code, label] of Object.entries(STATES)) {
  const list = stations.filter((s) => s.state === code);
  lines.push(`### ${label} (${code}) – ${list.length}`, '');
  lines.push(list.map((s) => `${s.name}`).join(' · ') || '_none_', '');
}
{
  const list = stations.filter((s) => !s.state);
  lines.push(`### National / webradio – ${list.length}`, '');
  lines.push(list.map((s) => s.name).join(' · '), '');
}

lines.push('## Dropped stations', '');
if (!dropped.length) lines.push('_None._', '');
else {
  lines.push('| Station | Reason | URLs tried |', '|---|---|---|');
  for (const r of dropped) {
    const reasons = r.tried.length ? [...new Set(r.tried.map((t) => t.reason))].join('; ') : 'no stream candidate found';
    const note = r.e.note ? ` (${r.e.note})` : '';
    lines.push(`| ${r.e.name} (\`${r.e.id}\`)${note} | ${reasons} | ${r.tried.map((t) => `\`${t.url}\``).join('<br>') || '–'} |`);
  }
  lines.push('');
}

if (skipped.length) {
  lines.push('## Removed during curation', '');
  lines.push('| Station | Why |', '|---|---|');
  for (const e of skipped) lines.push(`| ${e.name} (\`${e.id}\`) | ${e.note || 'skipped'} |`);
  lines.push('');
}

lines.push('## Stations without logo', '');
if (!noLogo.length) lines.push('_None._', '');
else {
  lines.push('| Station | Why |', '|---|---|');
  for (const s of noLogo) lines.push(`| ${s.name} (\`${s.id}\`) | ${(logos.get(s.id)?.note || 'no logo').replace(/\|/g, '/')} |`);
  lines.push('');
}

const noIcy = stations.filter((s) => !s.icy);
lines.push('## Stations without ICY metadata', '');
lines.push(noIcy.map((s) => `${s.name}${s.hls ? ' (HLS)' : ''}`).join(' · ') || '_None._', '');

const notes = curated.filter((e) => e.note && stations.some((s) => s.id === e.id));
if (notes.length) {
  lines.push('## Curation notes', '');
  for (const e of notes) lines.push(`- **${e.name}**: ${e.note}`);
  lines.push('');
}

lines.push('## Re-running', '');
lines.push('```sh');
lines.push('node scripts/stations/build.mjs --refresh   # refresh radio-browser dump, re-verify streams, rebuild logos');
lines.push('node scripts/stations/find.mjs "/^bayern 3/i"  # search the cached dump while curating');
lines.push('node scripts/stations/probe.mjs <url>       # probe a stream URL');
lines.push('```', '');
await writeFile(REPORT, lines.join('\n'));

console.log(
  `\nDone: ${stations.length} stations (${dropped.length} dropped), ${stations.length - noLogo.length} with logo, ${stations.filter((s) => s.icy).length} with ICY.`,
);
console.log(`Wrote ${path.relative(ROOT, OUT_JSON)}, ${path.relative(ROOT, REPORT)}`);
