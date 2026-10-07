// Logo discovery, validation and normalisation.
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { httpGet } from './http.mjs';

const execFileP = promisify(execFile);
const MAGICK = ['/opt/homebrew/bin/magick', '/usr/local/bin/magick', 'magick'];

const MIN_SIDE = 96;
const MAX_ASPECT = 2.0;
// URL patterns of generic / placeholder images that are never a station logo.
const BAD_URL = [
  /laut\.fm\/.*(default|placeholder)/i,
  /assets\.laut\.fm\/.*\/(logo|station)[^/]*default/i,
  /shoutcast/i,
  /radionomy/i,
  /tunein\.com\/.*default/i,
  /cdn-profiles\.tunein\.com\/s0\//i,
  /static\.radio\.(de|net)\/.*(default|fallback)/i,
  /\/wp-includes\/|s\.w\.org\//i,
  /gravatar/i,
  /streamonkey|streamabc|radiohost\.de|addradio|rndfnk/i,
];

export function sha1(buf) {
  return createHash('sha1').update(buf).digest('hex');
}

let cacheDir = null;
export function setCacheDir(dir) {
  cacheDir = dir;
}

/** GET with an on-disk cache (7 days) for logo/homepage fetches. */
export async function cachedGet(url, { maxBytes = 6 * 1024 * 1024, timeoutMs = 12000, browser = true, maxAgeH = 24 * 7 } = {}) {
  const key = sha1(url);
  const file = cacheDir ? path.join(cacheDir, 'http', key) : null;
  if (file) {
    try {
      const s = await stat(file);
      if (Date.now() - s.mtimeMs < maxAgeH * 3600_000) {
        const meta = JSON.parse(await readFile(file + '.json', 'utf8'));
        return { ...meta, body: await readFile(file) };
      }
    } catch {}
  }
  let res;
  try {
    res = await httpGet(url, {
      maxBytes,
      timeoutMs,
      browser,
      headers: { Accept: 'text/html,application/xhtml+xml,image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5' },
    });
  } catch (err) {
    res = { status: 0, headers: {}, body: Buffer.alloc(0), finalUrl: url, error: err?.code || err?.message };
  }
  const meta = { status: res.status, contentType: String(res.headers?.['content-type'] || ''), finalUrl: res.finalUrl, error: res.error };
  if (file) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, res.body);
    await writeFile(file + '.json', JSON.stringify(meta));
  }
  return { ...meta, body: res.body };
}

function absolutize(href, base) {
  try {
    return new URL(href.replace(/&amp;/g, '&').trim(), base).toString();
  } catch {
    return null;
  }
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4]) : null;
}

/** Extract icon candidates from a homepage. */
export async function homepageIconCandidates(homepage) {
  const out = [];
  if (!homepage) return out;
  const res = await cachedGet(homepage, { maxBytes: 1.5 * 1024 * 1024 });
  if (res.status !== 200 || !/html/i.test(res.contentType)) return out;
  const base = res.finalUrl || homepage;
  const html = res.body.toString('utf8');
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd > 0 ? html.slice(0, headEnd) : html.slice(0, 200_000);
  for (const tag of head.match(/<link\b[^>]*>/gi) || []) {
    const rel = (attr(tag, 'rel') || '').toLowerCase();
    const href = attr(tag, 'href');
    if (!href) continue;
    const sizes = attr(tag, 'sizes') || '';
    const size = Math.max(0, ...sizes.split(/\s+/).map((s) => parseInt(s, 10) || 0));
    if (rel.includes('apple-touch-icon')) out.push({ url: absolutize(href, base), src: 'apple-touch-icon', hint: size || 180 });
    else if (/(^|\s)icon(\s|$)/.test(rel) || rel.includes('shortcut')) {
      if (/\.svg(\?|$)/i.test(href) || /svg/i.test(attr(tag, 'type') || '')) out.push({ url: absolutize(href, base), src: 'icon-svg', hint: 512 });
      else out.push({ url: absolutize(href, base), src: 'icon', hint: size || 32 });
    } else if (rel.includes('manifest')) {
      const murl = absolutize(href, base);
      if (murl) {
        const m = await cachedGet(murl, { maxBytes: 256 * 1024 });
        try {
          const j = JSON.parse(m.body.toString('utf8'));
          for (const ic of j.icons || []) {
            const s = Math.max(0, ...String(ic.sizes || '').split(/\s+/).map((x) => parseInt(x, 10) || 0));
            if (ic.src) out.push({ url: absolutize(ic.src, m.finalUrl || murl), src: 'manifest', hint: s || 192, purpose: ic.purpose || '' });
          }
        } catch {}
      }
    }
  }
  for (const tag of head.match(/<meta\b[^>]*>/gi) || []) {
    const p = (attr(tag, 'property') || attr(tag, 'name') || '').toLowerCase();
    if (p === 'og:image' || p === 'twitter:image' || p === 'msapplication-tileimage') {
      const c = attr(tag, 'content');
      if (c) out.push({ url: absolutize(c, base), src: p === 'msapplication-tileimage' ? 'ms-tile' : 'og:image', hint: 0 });
    }
  }
  // conventional location
  out.push({ url: absolutize('/apple-touch-icon.png', base), src: 'apple-touch-icon', hint: 180 });
  return out.filter((c) => c.url && /^https?:/.test(c.url));
}

async function icoToPng(buf) {
  const tmp = path.join(os.tmpdir(), `rw-ico-${sha1(buf)}`);
  await writeFile(tmp + '.ico', buf);
  for (const bin of MAGICK) {
    try {
      // pick the largest frame
      const { stdout } = await execFileP(bin, ['identify', '-format', '%w %p\n', tmp + '.ico']);
      const frames = stdout.trim().split('\n').map((l) => l.split(' ').map(Number));
      frames.sort((a, b) => b[0] - a[0]);
      const idx = frames[0]?.[1] ?? 0;
      await execFileP(bin, [`${tmp}.ico[${idx}]`, tmp + '.png']);
      return await readFile(tmp + '.png');
    } catch {}
  }
  return null;
}

/**
 * Downloads and inspects an image candidate.
 * @returns {Promise<null | {buf:Buffer, width:number, height:number, format:string, hash:string, alpha:boolean, uniqueColors:number}>}
 */
export async function loadImage(url) {
  const res = await cachedGet(url);
  if (res.status !== 200 || res.body.length < 100) return { error: `HTTP ${res.status || res.error}` };
  let buf = res.body;
  const ct = res.contentType.toLowerCase();
  if (/html|json|text\/plain/.test(ct) && !/svg/.test(ct)) return { error: `not an image (${ct})` };
  const isIco = /icon|ico/.test(ct) || (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0);
  if (isIco) {
    buf = await icoToPng(buf);
    if (!buf) return { error: 'ico conversion failed' };
  }
  try {
    const isSvg = /svg/.test(ct) || /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg/i.test(buf.subarray(0, 2000).toString('utf8'));
    const img = isSvg ? sharp(buf, { density: 300 }).resize(512, 512, { fit: 'inside' }) : sharp(buf, { animated: false });
    const png = await img.png().toBuffer();
    const meta = await sharp(png).metadata();
    const stats = await analyse(png);
    return {
      buf: png,
      width: meta.width,
      height: meta.height,
      format: isSvg ? 'svg' : meta.format,
      hash: sha1(res.body),
      ...stats,
    };
  } catch (err) {
    return { error: `decode failed (${err.message.split('\n')[0]})` };
  }
}

async function analyse(png) {
  const { data, info } = await sharp(png).resize(64, 64, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const colors = new Set();
  let transparent = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 32) {
      transparent++;
      continue;
    }
    colors.add(((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3));
  }
  return { alpha: transparent > 0, transparentRatio: transparent / (info.width * info.height), uniqueColors: colors.size };
}

/** Trim fully transparent borders only (never colour borders – that would eat solid-background logos). */
async function trimTransparent(png) {
  const meta = await sharp(png).metadata();
  if (!meta.hasAlpha) return png;
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let top = h,
    left = w,
    right = -1,
    bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (right < 0) return png;
  if (top === 0 && left === 0 && right === w - 1 && bottom === h - 1) return png;
  return sharp(png).extract({ left, top, width: right - left + 1, height: bottom - top + 1 }).png().toBuffer();
}

/** Share of opaque pixels that stay visible on a white background (not near-white). */
async function inkOnWhite(png) {
  const { data } = await sharp(png).resize(128, 128, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let px = 0,
    transparent = 0,
    opaque = 0,
    ink = 0;
  for (let i = 0; i < data.length; i += 4) {
    px++;
    if (data[i + 3] < 128) {
      transparent++;
      continue;
    }
    opaque++;
    if (Math.min(data[i], data[i + 1], data[i + 2]) < 215) ink++;
  }
  return { transparentRatio: transparent / px, ink: opaque ? ink / opaque : 0 };
}

/**
 * Normalise to a 256x256 webp (logo fit inside 240x240, centred, transparency kept).
 * opts.trim: crop uniform borders (colour of the top-left pixel) first – for logos delivered on a big canvas.
 * opts.bg:   flatten onto this colour (used for white-on-transparent logos that would vanish on light UIs).
 */
export async function normaliseLogo(png, outFile, opts = {}) {
  let src = png;
  if (opts.trim) src = await sharp(src).trim({ threshold: 24 }).png().toBuffer();
  const trimmed = await trimTransparent(src);
  let bg = opts.bg || null;
  if (!bg) {
    const { transparentRatio, ink } = await inkOnWhite(trimmed);
    if (transparentRatio > 0.3 && ink < 0.15) bg = '#1E1E1E';
  }
  const inner = await sharp(trimmed)
    .resize(240, 240, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
    .png()
    .toBuffer();
  const meta = await sharp(inner).metadata();
  const left = Math.floor((256 - meta.width) / 2);
  const top = Math.floor((256 - meta.height) / 2);
  const background = bg ? hexToRgba(bg) : { r: 0, g: 0, b: 0, alpha: 0 };
  const canvas = sharp({ create: { width: 256, height: 256, channels: 4, background } }).composite([{ input: inner, left, top }]);
  const composed = await canvas.webp({ quality: 85, alphaQuality: 90, effort: 6 }).toBuffer();
  const webp = (await fullBleed(composed)) ?? composed;
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, webp);
  return { webp, color: await dominantColor(bg ? inner : webp), bg };
}

/**
 * Logos that are already a solid tile (square or uniform-edged banner, possibly with rounded corners)
 * are stretched edge to edge so the app tile shows no white frame. Returns null when the logo should keep its margin.
 */
export async function fullBleed(img, size = 256) {
  const { data, info } = await sharp(img).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const alpha = (x, y) => data[(y * w + x) * 4 + 3];
  let top = h,
    left = w,
    right = -1,
    bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha(x, y) > 8) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (right < 0) return null;
  const bw = right - left + 1;
  const bh = bottom - top + 1;
  let opaque = 0;
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) if (alpha(x, y) > 200) opaque++;
  if (opaque / (bw * bh) < 0.94) return null;

  const inset = Math.max(2, Math.round(Math.min(bw, bh) * 0.03));
  const edge = [];
  const sample = (x, y) => {
    const o = (y * w + x) * 4;
    if (data[o + 3] > 200) edge.push([data[o], data[o + 1], data[o + 2]]);
  };
  for (let x = left + inset; x <= right - inset; x++) {
    sample(x, top + inset);
    sample(x, bottom - inset);
  }
  for (let y = top + inset; y <= bottom - inset; y++) {
    sample(left + inset, y);
    sample(right - inset, y);
  }
  if (!edge.length) return null;
  const mean = [0, 1, 2].map((c) => edge.reduce((sum, p) => sum + p[c], 0) / edge.length);
  const uniform = edge.filter((p) => Math.abs(p[0] - mean[0]) + Math.abs(p[1] - mean[1]) + Math.abs(p[2] - mean[2]) < 30).length / edge.length >= 0.9;
  const square = Math.min(bw, bh) / Math.max(bw, bh) > 0.98;
  if (!square && !uniform) return null;
  if (bw === w && bh === h && opaque === bw * bh) return null;

  const [r, g, b] = mean.map(Math.round);
  const fill = { r, g, b, alpha: 1 };
  const cropped = sharp(img).extract({ left, top, width: bw, height: bh }).flatten({ background: fill });
  const fitted = square
    ? cropped.resize(size, size, { fit: 'fill', kernel: 'lanczos3' })
    : cropped.resize(size, size, { fit: 'contain', background: fill, kernel: 'lanczos3' });
  return fitted.webp({ quality: 85, effort: 6 }).toBuffer();
}

function hexToRgba(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), alpha: 1 };
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  return [0, s, l];
}

/** Dominant non-white / non-black / non-grey colour as hex, or null. */
export async function dominantColor(img) {
  const { data } = await sharp(img).resize(96, 96, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bins = new Map();
  let opaque = 0,
    colored = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 160) continue;
    opaque++;
    const [, s, l] = rgbToHsl(r, g, b);
    if (l > 0.92 || l < 0.08 || s < 0.2) continue; // white, black, grey
    colored++;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    bins.set(key, e);
  }
  if (!opaque || colored / opaque < 0.04 || colored < 20) return null;
  // merge neighbouring bins by picking the heaviest bin and averaging within it
  let best = null;
  for (const e of bins.values()) if (!best || e.n > best.n) best = e;
  const hex = (v) => Math.round(v / best.n).toString(16).padStart(2, '0');
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`.toUpperCase();
}

export function isBadUrl(url) {
  return BAD_URL.some((re) => re.test(url));
}

/**
 * Score a loaded candidate. Returns {score, reject?:string}.
 */
export function scoreCandidate(c, img) {
  if (!img || img.error) return { score: -1, reject: img?.error || 'load failed' };
  const { width: w, height: h } = img;
  const side = Math.min(w, h);
  const aspect = Math.max(w, h) / Math.max(1, side);
  if (img.format !== 'svg' && side < MIN_SIDE) return { score: -1, reject: `too small (${w}x${h})` };
  if (aspect > (c.src === 'override' ? 3.6 : MAX_ASPECT)) return { score: -1, reject: `too wide (${w}x${h})` };
  if (img.uniqueColors <= 2 && !img.alpha) return { score: -1, reject: 'blank image' };
  if (c.src === 'og:image' && aspect > 1.25) return { score: -1, reject: `og:image not square (${w}x${h})` };
  const photoLike = !img.alpha && img.uniqueColors > 1800;
  if (photoLike && (c.src === 'og:image' || c.src === 'twitter:image')) return { score: -1, reject: 'og:image looks like a photo' };
  let score = 0;
  score += Math.min(img.format === 'svg' ? 512 : side, 512) / 512 * 10; // resolution
  score += (1 / aspect) * 4; // squareness
  score += { override: 100, ard: 50, brand: 8, favicon: 3, manifest: 3, 'apple-touch-icon': 2.5, 'icon-svg': 2, icon: 1.5, 'ms-tile': 0.5, 'og:image': 0 }[c.src] ?? 0;
  if (photoLike) score -= 6;
  if (c.purpose && /maskable/.test(c.purpose)) score -= 1.5; // maskable icons have heavy padding
  return { score, side, aspect, photoLike };
}
