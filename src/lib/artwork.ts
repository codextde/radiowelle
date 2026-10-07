import { Asset } from 'expo-asset';

import { bundledLogos } from '@/data/logos.generated';

import type { Station } from './types';

const cache = new Map<string, string>();

export function logoSource(station: Pick<Station, 'logo'>) {
  if (!station.logo) return null;
  const bundled = bundledLogos[station.logo];
  if (bundled) return bundled;
  if (/^https?:\/\//.test(station.logo)) return { uri: station.logo };
  return null;
}

export async function artworkUri(station: Station): Promise<string | null> {
  if (!station.logo) return null;
  if (/^https?:\/\//.test(station.logo)) return station.logo;
  const cached = cache.get(station.logo);
  if (cached) return cached;
  const module = bundledLogos[station.logo];
  if (typeof module !== 'number') return null;
  try {
    const asset = Asset.fromModule(module);
    if (!asset.localUri) await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (uri) cache.set(station.logo, uri);
    return uri ?? null;
  } catch {
    return null;
  }
}
