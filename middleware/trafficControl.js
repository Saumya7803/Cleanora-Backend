import { ApiError } from "./errorMiddleware.js";

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const WINDOW_MS = toPositiveInt(process.env.REQUEST_RATE_LIMIT_WINDOW_MS, 60_000);
const MAX_PER_IP = toPositiveInt(process.env.REQUEST_RATE_LIMIT_MAX_PER_IP, 10_000);
const MAX_GLOBAL = toPositiveInt(process.env.REQUEST_RATE_LIMIT_MAX_GLOBAL, 120_000);
const MAX_IN_FLIGHT = toPositiveInt(process.env.MAX_IN_FLIGHT_REQUESTS, 1_000);
const CLEANUP_EVERY_N_REQUESTS = toPositiveInt(process.env.REQUEST_RATE_LIMIT_CLEANUP_INTERVAL, 500);

const ipWindowStore = new Map();
const globalWindow = {
  count: 0,
  startMs: Date.now(),
};

let totalSeenRequests = 0;
let activeRequests = 0;

const normalizeWindow = (bucket, now) => {
  if (now - bucket.startMs < WINDOW_MS) {
    return;
  }
  bucket.startMs = now;
  bucket.count = 0;
};

const getClientIp = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
};

const pruneExpiredBuckets = (now) => {
  const staleAfterMs = WINDOW_MS * 2;
  for (const [ip, bucket] of ipWindowStore.entries()) {
    if (now - bucket.startMs >= staleAfterMs) {
      ipWindowStore.delete(ip);
    }
  }
};

const addRateLimitHeaders = (res, remainingIp) => {
  res.setHeader("X-RateLimit-Limit", String(MAX_PER_IP));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remainingIp)));
  res.setHeader("X-RateLimit-Window-Ms", String(WINDOW_MS));
  res.setHeader("X-InFlight-Limit", String(MAX_IN_FLIGHT));
};

export const trafficControl = (req, res, next) => {
  if (req.method === "OPTIONS") {
    return next();
  }

  const now = Date.now();
  totalSeenRequests += 1;

  if (totalSeenRequests % CLEANUP_EVERY_N_REQUESTS === 0) {
    pruneExpiredBuckets(now);
  }

  if (activeRequests >= MAX_IN_FLIGHT) {
    return next(
      new ApiError("Server is busy. Please retry in a few seconds.", 503),
    );
  }

  normalizeWindow(globalWindow, now);
  if (globalWindow.count >= MAX_GLOBAL) {
    return next(
      new ApiError("Global request limit reached. Please retry shortly.", 503),
    );
  }

  const ip = getClientIp(req);
  const ipBucket = ipWindowStore.get(ip) || { count: 0, startMs: now };
  normalizeWindow(ipBucket, now);

  if (ipBucket.count >= MAX_PER_IP) {
    const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - ipBucket.startMs)) / 1_000);
    res.setHeader("Retry-After", String(Math.max(1, retryAfterSeconds)));
    addRateLimitHeaders(res, 0);
    return next(
      new ApiError(
        `Too many requests from this client. Retry in ${Math.max(1, retryAfterSeconds)} seconds.`,
        429,
      ),
    );
  }

  ipBucket.count += 1;
  globalWindow.count += 1;
  ipWindowStore.set(ip, ipBucket);

  addRateLimitHeaders(res, MAX_PER_IP - ipBucket.count);

  activeRequests += 1;
  let released = false;
  const release = () => {
    if (released) {
      return;
    }
    released = true;
    activeRequests = Math.max(0, activeRequests - 1);
  };

  res.once("finish", release);
  res.once("close", release);

  return next();
};

