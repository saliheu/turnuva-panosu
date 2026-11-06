/** Basit anahtar-değer deposu arayüzü: Netlify Blobs (canlı) veya dosya sistemi (yerel geliştirme). */
export interface KV {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

/** Testler ve geliştirme için bellek içi depo */
export function memoryStore(): KV {
  const data = new Map<string, string>();
  return {
    async get<T>(key: string) {
      const v = data.get(key);
      return v == null ? null : (JSON.parse(v) as T);
    },
    async set(key, value) {
      data.set(key, JSON.stringify(value));
    },
    async list(prefix) {
      return [...data.keys()].filter((k) => k.startsWith(prefix));
    },
    async delete(key) {
      data.delete(key);
    },
  };
}
