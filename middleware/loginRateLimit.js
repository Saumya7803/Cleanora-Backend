import { ApiError } from "./errorMiddleware.js";

const loginAttemptStore = new Map();

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const MAX_ATTEMPTS = toPositiveInt(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS, 5);
const WINDOW_MINUTES = toPositiveInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES, 15);
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;

const getClientIp = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim().length > 0) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "unknown";
};

const getEmail = (req) => {
  if (typeof req.body?.email !== "string") {
    return "";
  }

  return req.body.email.toLowerCase().trim();
};

const getAttemptKey = (req) => `${getClientIp(req)}::${getEmail(req) || "unknown"}`;

const getRetryAfterSeconds = (blockedUntil, now) => {
  const remainingMs = Math.max(0, blockedUntil - now);
  return Math.ceil(remainingMs / 1000);
};

const pruneExpiredEntries = (now) => {
  for (const [key, attempt] of loginAttemptStore.entries()) {
    if (attempt.blockedUntil && attempt.blockedUntil > now) {
      continue;
    }

    if (now - attempt.windowStart > WINDOW_MS) {
      loginAttemptStore.delete(key);
    }
  }
};

const getBlockedError = (retryAfterSeconds) =>
  new ApiError(
    `Too many failed login attempts. Try again in ${retryAfterSeconds} seconds.`,
    429,
  );

export const loginRateLimit = (req, _res, next) => {
  const now = Date.now();
  pruneExpiredEntries(now);

  const attempt = loginAttemptStore.get(getAttemptKey(req));

  if (!attempt) {
    return next();
  }

  if (attempt.blockedUntil && attempt.blockedUntil > now) {
    const retryAfterSeconds = getRetryAfterSeconds(attempt.blockedUntil, now);
    return next(getBlockedError(retryAfterSeconds));
  }

  return next();
};

export const clearLoginFailures = (req) => {
  loginAttemptStore.delete(getAttemptKey(req));
};

export const recordLoginFailure = (req) => {
  const now = Date.now();
  const key = getAttemptKey(req);
  const previous = loginAttemptStore.get(key);
  const inSameWindow = previous && now - previous.windowStart <= WINDOW_MS;

  const failedCount = inSameWindow ? previous.failedCount + 1 : 1;
  const windowStart = inSameWindow ? previous.windowStart : now;
  const blockedUntil = failedCount >= MAX_ATTEMPTS ? now + WINDOW_MS : null;

  loginAttemptStore.set(key, { failedCount, windowStart, blockedUntil });

  if (blockedUntil) {
    const retryAfterSeconds = getRetryAfterSeconds(blockedUntil, now);
    throw getBlockedError(retryAfterSeconds);
  }
};
