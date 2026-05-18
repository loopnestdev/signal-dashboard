import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 30, checkperiod: 15 });

export function getFromCache<T>(key: string): T | undefined {
  return cache.get<T>(key);
}

export function setToCache<T>(key: string, value: T, ttl?: number): void {
  if (ttl !== undefined) cache.set(key, value, ttl);
  else cache.set(key, value);
}

export function getCacheTTL(key: string): number {
  return cache.getTtl(key) ?? 0;
}
