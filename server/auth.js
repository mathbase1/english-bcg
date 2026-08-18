import crypto from "node:crypto";

export function setCors(req, res) {
  const requestOrigin = String(req.headers?.origin || "");
  const configured = String(process.env.ALLOW_ORIGIN || "*")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  let allowOrigin = "*";
  if (!configured.includes("*")) {
    allowOrigin = configured.includes(requestOrigin) ? requestOrigin : configured[0] || "";
  }

  if (allowOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
}

export function handleOptions(req, res) {
  if (req.method !== "OPTIONS") return false;
  res.status(204).end();
  return true;
}

export function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

export function safeEqualText(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function issueAccessToken() {
  const secret = getAuthSecret();
  const now = Math.floor(Date.now() / 1000);
  const hours = clampNumber(process.env.AUTH_SESSION_HOURS, 1, 12, 2);
  const payload = {
    iat: now,
    exp: now + hours * 60 * 60,
    sid: crypto.randomBytes(12).toString("hex")
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return {
    token: `${encoded}.${signature}`,
    expiresIn: hours * 60 * 60
  };
}

export function verifyAccessToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [encoded, suppliedSignature] = token.split(".");
  if (!encoded || !suppliedSignature) return null;

  let secret;
  try {
    secret = getAuthSecret();
  } catch {
    return null;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");

  if (!safeEqualText(suppliedSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.exp || Number(payload.exp) <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function requireAccess(req, res) {
  const authHeader = String(req.headers?.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({ error: "Access session is missing or has expired." });
    return null;
  }
  return payload;
}

export function getAccessPassword() {
  const value = String(process.env.ACCESS_PASSWORD || "");
  if (!value) {
    throw new Error("Missing ACCESS_PASSWORD in Vercel environment variables.");
  }
  return value;
}

function getAuthSecret() {
  const value = String(process.env.AUTH_SECRET || "");
  if (value.length < 32) {
    throw new Error("AUTH_SECRET must be set in Vercel and contain at least 32 characters.");
  }
  return value;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}
