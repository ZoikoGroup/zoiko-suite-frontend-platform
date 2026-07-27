// Mock authentication for the ZoikoSuite admin console demo.
// There is no backend/identity provider yet — this validates a single
// demo credential and issues an opaque session cookie the middleware checks.

export const SESSION_COOKIE = "zoiko_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

export const DEMO_CREDENTIALS = {
  email: "admin@zoikosuite.com",
  password: "Zoiko@Governance1",
};

export type SessionPayload = {
  email: string;
  name: string;
  role: string;
  iat: number;
};

export function verifyCredentials(email: string, password: string) {
  return (
    email.trim().toLowerCase() === DEMO_CREDENTIALS.email &&
    password === DEMO_CREDENTIALS.password
  );
}

export function encodeSession(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
}

export function decodeSession(value: string | undefined | null): SessionPayload | null {
  if (!value) return null;
  try {
    const json = Buffer.from(value, "base64url").toString("utf-8");
    const parsed = JSON.parse(json) as SessionPayload;
    if (!parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createDemoSession(): SessionPayload {
  return {
    email: DEMO_CREDENTIALS.email,
    name: "Lingaraj",
    role: "Platform Administrator",
    iat: Date.now(),
  };
}
