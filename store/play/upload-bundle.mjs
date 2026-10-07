import fs from 'node:fs';
import { api } from './gplay.mjs';
const PKG = 'de.codext.radiowelle';
const [file, track = 'internal', status = 'completed'] = process.argv.slice(2);
const edit = await api('POST', `/applications/${PKG}/edits`, {});
if (edit.status !== 200) throw new Error(JSON.stringify(edit.json));
const id = edit.json.id;
console.log('edit', id);
const up = await api('POST', `/applications/${PKG}/edits/${id}/bundles?uploadType=media`, fs.readFileSync(file), { upload: true });
console.log('bundle', up.status, JSON.stringify(up.json).slice(0, 400));
if (up.status !== 200) process.exit(1);
const versionCode = up.json.versionCode;
const tr = await api('PUT', `/applications/${PKG}/edits/${id}/tracks/${track}`, {
  track,
  releases: [{ name: `1.0.0 (${versionCode})`, versionCodes: [String(versionCode)], status, releaseNotes: [
    { language: 'de-DE', text: 'Die erste Version von Radiowelle: über 260 deutsche Sender, weltweite Suche, Songtitel live, Favoriten und Sleep-Timer.' },
    { language: 'en-US', text: 'The first version of Radiowelle: 260+ German stations, worldwide search, live song titles, favorites and a sleep timer.' },
  ] }],
});
console.log('track', tr.status, JSON.stringify(tr.json).slice(0, 400));
const commit = await api('POST', `/applications/${PKG}/edits/${id}:commit`);
console.log('commit', commit.status, JSON.stringify(commit.json).slice(0, 600));
