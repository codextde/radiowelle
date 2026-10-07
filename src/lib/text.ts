export function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function compact(value: string) {
  return normalize(value).replace(/\s+/g, '');
}

export function initials(name: string) {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].length <= 5 ? words[0].toUpperCase() : words[0].slice(0, 2).toUpperCase();
  if (/^\d/.test(words[0]) && words[0].length <= 5) return words[0];
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function cleanStationName(name: string) {
  return name
    .replace(/\s*[\[(]?\b(mp3|aac\+?|ogg|opus|flac|hls)\b[\])]?/gi, ' ')
    .replace(/\s*[\[(]?\b\d{2,3}\s?k(bps|b\/s)?\b[\])]?/gi, ' ')
    .replace(/\s*[|]\s*$/g, '')
    .replace(/\s+[-|]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
