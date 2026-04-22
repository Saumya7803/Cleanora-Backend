import fs from "fs";

let cachedMessaging = null;
let initializationAttempted = false;

const parseServiceAccount = () => {
  const inlineJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (inlineJson && inlineJson.trim()) {
    try {
      return JSON.parse(inlineJson);
    } catch {
      return null;
    }
  }

  const serviceAccountPath = process.env.FCM_SERVICE_ACCOUNT_PATH;
  if (!serviceAccountPath || !serviceAccountPath.trim()) {
    return null;
  }

  try {
    const raw = fs.readFileSync(serviceAccountPath.trim(), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const getMessagingClient = async () => {
  if (cachedMessaging) {
    return cachedMessaging;
  }

  if (initializationAttempted) {
    return null;
  }
  initializationAttempted = true;

  const serviceAccount = parseServiceAccount();
  if (!serviceAccount) {
    return null;
  }

  try {
    const firebaseAdmin = await import("firebase-admin");
    const admin = firebaseAdmin.default || firebaseAdmin;
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    cachedMessaging = admin.messaging();
    return cachedMessaging;
  } catch {
    return null;
  }
};

const normalizeDataPayload = (data = {}) => {
  const normalized = {};
  for (const [key, value] of Object.entries(data)) {
    normalized[key] = value == null ? "" : String(value);
  }
  return normalized;
};

export const sendPushToTokens = async ({ tokens, title, message, data = {} }) => {
  const uniqueTokens = [...new Set((tokens || []).map((token) => String(token || "").trim()))].filter(
    Boolean,
  );
  if (uniqueTokens.length === 0) {
    return {
      enabled: false,
      sentCount: 0,
      failedCount: 0,
      invalidTokens: [],
    };
  }

  const messaging = await getMessagingClient();
  if (!messaging) {
    return {
      enabled: false,
      sentCount: 0,
      failedCount: 0,
      invalidTokens: [],
    };
  }

  const response = await messaging.sendEachForMulticast({
    tokens: uniqueTokens,
    notification: {
      title: String(title || "StoreSync"),
      body: String(message || ""),
    },
    data: normalizeDataPayload(data),
  });

  const invalidTokens = [];
  response.responses.forEach((result, index) => {
    if (result.success) {
      return;
    }

    const errorCode = String(result.error?.code || "");
    if (
      errorCode.includes("registration-token-not-registered") ||
      errorCode.includes("invalid-registration-token")
    ) {
      invalidTokens.push(uniqueTokens[index]);
    }
  });

  return {
    enabled: true,
    sentCount: response.successCount,
    failedCount: response.failureCount,
    invalidTokens,
  };
};
