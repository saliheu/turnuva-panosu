import { getStore } from '@netlify/blobs';
import type { Config } from '@netlify/functions';
import { handleApi } from '../../server/api';
import type { KV } from '../../server/store';

/** Netlify Blobs üzerinde anahtar-değer deposu (ücretsiz planda dahildir). */
function blobStore(): KV {
  const store = getStore({ name: 'turnuva-panosu', consistency: 'strong' });
  return {
    async get<T>(key: string) {
      return ((await store.get(key, { type: 'json' })) as T | null) ?? null;
    },
    async set(key, value) {
      await store.setJSON(key, value);
    },
    async list(prefix) {
      const { blobs } = await store.list({ prefix });
      return blobs.map((b) => b.key);
    },
    async delete(key) {
      await store.delete(key);
    },
  };
}

export default async (req: Request) => {
  return handleApi(req, blobStore(), {
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    SESSION_SECRET: process.env.SESSION_SECRET,
  });
};

export const config: Config = {
  path: '/api/*',
};
