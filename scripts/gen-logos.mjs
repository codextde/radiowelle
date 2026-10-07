import fs from 'node:fs';
const stations = JSON.parse(fs.readFileSync('src/data/stations-de.json', 'utf8'));
const lines = ["import type { ImageSourcePropType } from 'react-native';", '', 'export const bundledLogos: Record<string, ImageSourcePropType> = {'];
for (const s of stations) {
  if (!s.logo) continue;
  if (!fs.existsSync(`assets/logos/${s.logo}`)) {
    console.error('missing', s.logo);
    continue;
  }
  lines.push(`  '${s.logo}': require('../../assets/logos/${s.logo}'),`);
}
lines.push('};', '');
fs.writeFileSync('src/data/logos.generated.ts', lines.join('\n'));
console.log('logos', lines.length - 5);
