type CacheAdapter = {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
};

class MemoryCache implements CacheAdapter {
  private store = new Map<string, { expiresAt: number; value: unknown }>();
  async get<T>(key: string): Promise<T | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiresAt && item.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return item.value as T;
  }
  async set<T>(key: string, value: T, ttlSeconds = 3600) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
  async del(key: string) {
    this.store.delete(key);
  }
}

let adapter: CacheAdapter | null = null;

export async function cache(): Promise<CacheAdapter> {
  if (adapter) return adapter;

  if (process.env.REDIS_PROVIDER === 'upstash' && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
    adapter = {
      get: async <T>(key: string) => redis.get<T>(key),
      set: async <T>(key: string, value: T, ttl = 3600) => {
        await redis.set(key, value as any, { ex: ttl });
      },
      del: async (key: string) => {
        await redis.del(key);
      }
    };
    return adapter;
  }

  if (process.env.REDIS_PROVIDER === 'local' && process.env.REDIS_URL) {
    try {
      const Redis = (await import('ioredis')).default;
      const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
      await redis.connect();
      adapter = {
        get: async <T>(key: string) => {
          const raw = await redis.get(key);
          return raw ? (JSON.parse(raw) as T) : null;
        },
        set: async <T>(key: string, value: T, ttl = 3600) => {
          await redis.set(key, JSON.stringify(value), 'EX', ttl);
        },
        del: async (key: string) => {
          await redis.del(key);
        }
      };
      return adapter;
    } catch (error) {
      console.warn('Redis local indisponível, usando cache em memória:', error);
    }
  }

  adapter = new MemoryCache();
  return adapter;
}
