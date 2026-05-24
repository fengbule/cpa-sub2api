const DEFAULT_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

const DEFAULT_MODEL_MAPPING = Object.freeze({
  "codex-auto-review": "codex-auto-review",
  "gpt-4o-audio-preview": "gpt-4o-audio-preview",
  "gpt-4o-realtime-preview": "gpt-4o-realtime-preview",
  "gpt-5.2": "gpt-5.2",
  "gpt-5.2-2025-12-11": "gpt-5.2-2025-12-11",
  "gpt-5.2-chat-latest": "gpt-5.2-chat-latest",
  "gpt-5.2-pro": "gpt-5.2-pro",
  "gpt-5.2-pro-2025-12-11": "gpt-5.2-pro-2025-12-11",
  "gpt-5.3-codex": "gpt-5.3-codex",
  "gpt-5.3-codex-spark": "gpt-5.3-codex-spark",
  "gpt-5.4": "gpt-5.4",
  "gpt-5.4-2026-03-05": "gpt-5.4-2026-03-05",
  "gpt-5.4-mini": "gpt-5.4-mini",
  "gpt-5.5": "gpt-5.5",
  "gpt-image-1": "gpt-image-1",
  "gpt-image-1.5": "gpt-image-1.5",
  "gpt-image-2": "gpt-image-2",
});

function parseJson(text) {
  return JSON.parse(text);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCpaObject(value) {
  return (
    isObject(value) &&
    typeof value.type === "string" &&
    typeof value.access_token === "string" &&
    typeof value.refresh_token === "string"
  );
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}

function toLocalOffsetIso(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);

  return `${local}${sign}${hours}:${minutes}`;
}

function inferEmailFromPayload(payload) {
  return (
    payload?.email ||
    payload?.["https://api.openai.com/profile"]?.email ||
    payload?.["https://api.openai.com/profile"]?.preferred_username ||
    ""
  );
}

function inferExpiryFromPayload(payload) {
  if (!payload?.exp) {
    return "";
  }

  return toLocalOffsetIso(payload.exp * 1000);
}

function detectFormat(data) {
  if (
    isObject(data) &&
    Array.isArray(data.accounts) &&
    Object.prototype.hasOwnProperty.call(data, "exported_at")
  ) {
    return "sub2api";
  }

  if (isCpaObject(data)) {
    return "cpa";
  }

  if (Array.isArray(data) && data.length > 0 && data.every(isCpaObject)) {
    return "cpa-batch";
  }

  return "unknown";
}

function summarizeAccounts(accounts) {
  return accounts
    .map((account, index) => {
      const credentials = account?.credentials ?? {};
      return {
        index,
        name: account?.name || `account-${index + 1}`,
        email: credentials.email || "",
        platform: account?.platform || "",
      };
    })
    .filter((item) => item.platform === "openai" || item.email || item.name);
}

function buildSub2ApiAccountFromCpa(cpa, options = {}) {
  const accessPayload = decodeJwtPayload(cpa.access_token);
  const idPayload = decodeJwtPayload(cpa.id_token);
  const email = cpa.email || inferEmailFromPayload(accessPayload) || inferEmailFromPayload(idPayload);
  const expiresAt = cpa.expired || inferExpiryFromPayload(accessPayload) || "";
  const clientId = accessPayload?.client_id || idPayload?.aud?.[0] || DEFAULT_CLIENT_ID;
  const organizationId =
    idPayload?.["https://api.openai.com/auth"]?.organizations?.[0]?.id || "";
  const accountName = options.accountName || email || "imported-account";

  return {
    name: accountName,
    platform: "openai",
    type: "oauth",
    credentials: {
      access_token: cpa.access_token || "",
      client_id: clientId,
      email,
      expires_at: expiresAt,
      id_token: cpa.id_token || "",
      model_mapping: { ...DEFAULT_MODEL_MAPPING },
      organization_id: organizationId,
      refresh_token: cpa.refresh_token || "",
    },
    extra: {
      email,
      privacy_mode: "training_off",
    },
    concurrency: 10,
    priority: 1,
    rate_multiplier: 1,
    auto_pause_on_expired: true,
  };
}

function wrapSub2ApiAccounts(accounts) {
  return {
    exported_at: new Date().toISOString(),
    proxies: [],
    accounts,
  };
}

function cpaToSub2Api(cpa, options = {}) {
  return wrapSub2ApiAccounts([buildSub2ApiAccountFromCpa(cpa, options)]);
}

function cpaListToMergedSub2Api(cpaList, options = {}) {
  const accountNames = Array.isArray(options.accountNames) ? options.accountNames : [];
  const accounts = cpaList.map((cpa, index) =>
    buildSub2ApiAccountFromCpa(cpa, {
      accountName: accountNames[index] || options.accountNameResolver?.(cpa, index),
    })
  );

  return wrapSub2ApiAccounts(accounts);
}

function sub2ApiAccountToCpa(account) {
  const credentials = account?.credentials ?? {};
  const accessPayload = decodeJwtPayload(credentials.access_token);
  const idPayload = decodeJwtPayload(credentials.id_token);
  const email = credentials.email || inferEmailFromPayload(accessPayload) || inferEmailFromPayload(idPayload);
  const expired = credentials.expires_at || inferExpiryFromPayload(accessPayload) || "";
  const lastRefresh = new Date().toISOString();

  return {
    access_token: credentials.access_token || "",
    account_id: credentials.organization_id || "",
    disabled: false,
    email,
    expired,
    id_token: credentials.id_token || "",
    last_refresh: toLocalOffsetIso(lastRefresh),
    refresh_token: credentials.refresh_token || "",
    type: "codex",
  };
}

function sub2ApiToCpaList(sub2api) {
  const accounts = Array.isArray(sub2api.accounts) ? sub2api.accounts : [];
  return accounts
    .filter((account) => (account?.platform || "").toLowerCase() === "openai")
    .map((account) => ({
      name: account?.name || inferEmailFromPayload(decodeJwtPayload(account?.credentials?.access_token)) || "account",
      data: sub2ApiAccountToCpa(account),
    }));
}

function sanitizeFileToken(value, fallback) {
  const safe = String(value || fallback)
    .replace(/[^a-z0-9@._-]+/gi, "-")
    .replace(/^-+|-+$/g, "");

  return safe || fallback;
}

function buildDownloadName(targetFormat, context = {}) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (targetFormat === "sub2api") {
    if (context.singleName) {
      return `sub2api-${sanitizeFileToken(context.singleName, "account")}.json`;
    }

    if (context.merged) {
      return `sub2api-merged-${stamp}.json`;
    }

    return `sub2api-account-${stamp}.json`;
  }

  if (targetFormat === "cpa" && context.singleName) {
    return `codex-${sanitizeFileToken(context.singleName, "account")}.json`;
  }

  return `codex-account-${stamp}.json`;
}

export {
  buildDownloadName,
  cpaListToMergedSub2Api,
  cpaToSub2Api,
  detectFormat,
  parseJson,
  sub2ApiToCpaList,
  summarizeAccounts,
};
