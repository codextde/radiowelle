// Stream verification: GET with Icy-MetaData, read the first ~16 KB, decide whether it is playable audio.
import { httpGet } from './http.mjs';

const MAX_BYTES = 16 * 1024;

function sniffAudio(buf) {
  if (buf.length < 4) return null;
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return 'MP3'; // ID3
  if (buf.subarray(0, 4).toString('latin1') === 'OggS') return 'OGG';
  if (buf.subarray(0, 4).toString('latin1') === 'fLaC') return 'FLAC';
  // MPEG audio / ADTS frame sync somewhere in the first bytes
  for (let i = 0; i < Math.min(buf.length - 1, 4096); i++) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xf6) === 0xf0) return 'AAC'; // ADTS (layer bits 00)
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0 && (buf[i + 1] & 0x06) !== 0) return 'MP3';
  }
  return null;
}

function codecFromContentType(ct) {
  if (!ct) return null;
  if (/mpegurl|m3u/.test(ct)) return null;
  if (/audio\/(mpeg|mp3|mpeg3|x-mpeg)/.test(ct)) return 'MP3';
  if (/aacp|aac|mp4a|audio\/mp4|audio\/x-m4a/.test(ct)) return 'AAC';
  if (/ogg|opus|vorbis/.test(ct)) return 'OGG';
  if (/flac/.test(ct)) return 'FLAC';
  return null;
}

/**
 * Probes a stream URL once.
 * @returns {Promise<{ok:boolean, reason?:string, status?:number, contentType?:string, icy:boolean,
 *   hls:boolean, codec?:string|null, bitrate?:number|null, finalUrl?:string, icyName?:string|null}>}
 */
export async function probeOnce(url, { timeoutMs = 8000 } = {}) {
  let res;
  try {
    res = await httpGet(url, { maxBytes: MAX_BYTES, timeoutMs, headers: { 'Icy-MetaData': '1' } });
  } catch (err) {
    const msg = err?.code || err?.message || String(err);
    return { ok: false, reason: msg, icy: false, hls: false };
  }
  const ct = String(res.headers['content-type'] || '').toLowerCase();
  const icy = 'icy-metaint' in res.headers;
  const icyBr = parseInt(String(res.headers['icy-br'] || '').split(',')[0], 10);
  const icyName = res.headers['icy-name'] ? Buffer.from(String(res.headers['icy-name']), 'latin1').toString('utf8') : null;
  const base = { status: res.status, contentType: ct, icy, finalUrl: res.finalUrl, icyName };
  if (res.status !== 200) return { ok: false, reason: `HTTP ${res.status}`, hls: false, ...base };

  const buf = res.body;
  const head = buf.subarray(0, 512).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (head.startsWith('#EXTM3U') || /mpegurl/.test(ct)) {
    const text = buf.toString('utf8');
    const isHls = /#EXT-X-(STREAM-INF|TARGETDURATION|MEDIA-SEQUENCE|VERSION)/.test(text);
    if (!isHls) return { ok: false, reason: 'plain m3u playlist (not HLS)', hls: false, ...base };
    let bitrate = null;
    const bw = [...text.matchAll(/[^-]BANDWIDTH=(\d+)/g)].map((m) => +m[1]);
    if (bw.length) bitrate = Math.round(Math.max(...bw) / 1000);
    const codec = /mp4a|aac/i.test(text) ? 'AAC' : /mp3/i.test(text) ? 'MP3' : 'AAC';
    return { ok: true, hls: true, codec, bitrate, ...base };
  }
  if (/text\/html|application\/json|text\/xml/.test(ct)) {
    return { ok: false, reason: `not audio (${ct})`, hls: false, ...base };
  }
  if (/scpls|\/pls/.test(ct) || head.startsWith('[playlist]')) {
    return { ok: false, reason: 'pls playlist, not a stream', hls: false, ...base };
  }
  if (buf.length < 2048) return { ok: false, reason: `too little data (${buf.length} B)`, hls: false, ...base };
  const ctCodec = codecFromContentType(ct);
  const sniffed = sniffAudio(buf);
  const audioCt = /^audio\//.test(ct) || ct.startsWith('application/ogg');
  const bitrate = Number.isFinite(icyBr) && icyBr > 0 ? icyBr : null;
  if (audioCt && (ctCodec || sniffed)) return { ok: true, hls: false, codec: ctCodec || sniffed, bitrate, ...base };
  if ((ct === '' || /octet-stream/.test(ct) || audioCt) && sniffed) return { ok: true, hls: false, codec: sniffed, bitrate, ...base };
  return { ok: false, reason: `unrecognised content (${ct || 'no content-type'})`, hls: false, ...base };
}

/** Probes up to `attempts` times; returns the first success or the last failure. */
export async function probe(url, { attempts = 2, timeoutMs = 8000 } = {}) {
  let last;
  for (let i = 0; i < attempts; i++) {
    last = await probeOnce(url, { timeoutMs });
    if (last.ok) return { ...last, attempts: i + 1 };
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500));
  }
  return { ...last, attempts };
}

/** Runs async fn over items with limited concurrency. */
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
