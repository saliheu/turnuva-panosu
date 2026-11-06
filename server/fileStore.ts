import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { KV } from './store';

/** Yerel geliştirme için dosya tabanlı depo (.yerel-veri klasörü). Canlıda kullanılmaz. */
export function fileStore(dir: string): KV {
  const file = (key: string) => join(dir, encodeURIComponent(key) + '.json');
  return {
    async get<T>(key: string) {
      try {
        return JSON.parse(await readFile(file(key), 'utf8')) as T;
      } catch {
        return null;
      }
    },
    async set(key, value) {
      await mkdir(dir, { recursive: true });
      await writeFile(file(key), JSON.stringify(value), 'utf8');
    },
    async list(prefix) {
      try {
        const names = await readdir(dir);
        return names.map((n) => decodeURIComponent(n.replace(/\.json$/, ''))).filter((k) => k.startsWith(prefix));
      } catch {
        return [];
      }
    },
    async delete(key) {
      await rm(file(key), { force: true });
    },
  };
}
