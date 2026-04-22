const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const CACHE_ENABLED = process.env.RESPONSE_CACHE_ENABLED !== "false";

export const createResponseCache = ({
  ttlSeconds = toPositiveInt(process.env.RESPONSE_CACHE_TTL_SECONDS, 15),
  maxEntries = toPositiveInt(process.env.RESPONSE_CACHE_MAX_ENTRIES, 500),
  keyBuilder,
} = {}) => {
  const store = new Map();
  const ttlMs = Math.max(1_000, ttlSeconds * 1_000);

  const cleanup = (now) => {
    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt <= now) {
        store.delete(key);
      }
    }

    if (store.size <= maxEntries) {
      return;
    }

    const oldestKeys = [...store.entries()]
      .sort((left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt)
      .slice(0, Math.max(0, store.size - maxEntries))
      .map(([key]) => key);

    for (const key of oldestKeys) {
      store.delete(key);
    }
  };

  return (req, res, next) => {
    if (!CACHE_ENABLED || req.method !== "GET") {
      return next();
    }

    const cacheKey = keyBuilder ? keyBuilder(req) : req.originalUrl;
    if (!cacheKey) {
      return next();
    }

    const now = Date.now();
    const cached = store.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      cached.lastAccessedAt = now;
      res.setHeader("X-Response-Cache", "HIT");
      res.status(cached.statusCode);
      res.type(cached.contentType);
      return res.send(cached.body);
    }

    if (cached) {
      store.delete(cacheKey);
    }

    res.setHeader("X-Response-Cache", "MISS");
    const originalJson = res.json.bind(res);

    res.json = (payload) => {
      const statusCode = res.statusCode || 200;
      if (statusCode >= 200 && statusCode < 400) {
        const body = JSON.stringify(payload);
        store.set(cacheKey, {
          statusCode,
          contentType: "application/json; charset=utf-8",
          body,
          expiresAt: Date.now() + ttlMs,
          lastAccessedAt: Date.now(),
        });
        cleanup(Date.now());
      }
      return originalJson(payload);
    };

    return next();
  };
};

