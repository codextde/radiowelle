// Small lenient HTTP GET helper.
// Many streaming servers (QuantumCast/streamabc, old Icecast/SHOUTcast) send slightly malformed HTTP
// that fetch()/undici rejects, so we use node:http(s) with the lenient parser and follow redirects manually.
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import { USER_AGENT } from './radiobrowser.mjs';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

/**
 * GET a URL, reading at most maxBytes of the body.
 * @returns {Promise<{status:number, headers:object, body:Buffer, finalUrl:string, truncated:boolean}>}
 */
export function httpGet(url, { maxBytes = 16 * 1024, timeoutMs = 8000, headers = {}, maxRedirects = 6, browser = false } = {}) {
  const deadline = Date.now() + timeoutMs;
  const hdrs = { 'User-Agent': browser ? BROWSER_UA : USER_AGENT, Accept: '*/*', ...headers };

  const once = (u, hops) =>
    new Promise((resolve, reject) => {
      let parsed;
      try {
        parsed = new URL(u);
      } catch {
        return reject(new Error(`invalid URL ${u}`));
      }
      const mod = parsed.protocol === 'https:' ? https : parsed.protocol === 'http:' ? http : null;
      if (!mod) return reject(new Error(`unsupported protocol ${parsed.protocol}`));
      const remaining = deadline - Date.now();
      if (remaining <= 0) return reject(new Error('timeout'));
      let onTimeout = () => req.destroy(new Error('timeout'));
      const req = mod.get(parsed, { headers: hdrs, insecureHTTPParser: true, rejectUnauthorized: true }, (res) => {
        const status = res.statusCode;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          clearTimeout(timer);
          res.resume();
          req.destroy();
          if (hops >= maxRedirects) return reject(new Error('too many redirects'));
          const next = new URL(res.headers.location, u).toString();
          return once(next, hops + 1).then(resolve, reject);
        }
        const chunks = [];
        let total = 0;
        let finished = false;
        const finish = (truncated) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          let body = Buffer.concat(chunks);
          const enc = (res.headers['content-encoding'] || '').toLowerCase();
          try {
            if (!truncated && enc === 'gzip') body = zlib.gunzipSync(body);
            else if (!truncated && enc === 'br') body = zlib.brotliDecompressSync(body);
            else if (!truncated && enc === 'deflate') body = zlib.inflateSync(body);
          } catch {}
          resolve({ status, headers: res.headers, body, finalUrl: u, truncated });
        };
        onTimeout = () => {
          if (total > 0) finish(true);
          req.destroy(new Error('timeout'));
        };
        res.on('data', (d) => {
          chunks.push(d);
          total += d.length;
          if (total >= maxBytes) {
            finish(true);
            req.destroy();
          }
        });
        res.on('end', () => finish(false));
        res.on('error', (e) => (total > 0 ? finish(true) : reject(e)));
        res.on('close', () => (total > 0 ? finish(true) : null));
      });
      const timer = setTimeout(() => onTimeout(), remaining);
      req.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });

  return once(url, 0);
}
