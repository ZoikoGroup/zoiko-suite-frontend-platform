// Mock authentication for the ZoikoSuite admin console demo.
// There is no backend/identity provider yet — this validates a single
// demo credential and issues an opaque session cookie the middleware checks.

export const SESSION_COOKIE = "zoiko_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

export const DEMO_CREDENTIALS = {
  email: "admin@zoikosuite.com",
  password: "Zoiko@Governance1",
};

export type GovernedUserAccount = {
  email: string;
  password: string;
  name: string;
  role: string;
  domain: string;
  principalId: string;
  tenantId: string;
  legalEntityId: string;
};

export const GOVERNED_USER_ACCOUNTS: GovernedUserAccount[] = [
  {
    email: "admin@zoikosuite.com",
    password: "Zoiko@Governance1",
    name: "Lingaraj (Super Admin)",
    role: "Platform Administrator",
    domain: "Global Governance & Core Platform",
    principalId: "33333333-3333-3333-3333-333333333333",
    tenantId: "11111111-1111-1111-1111-111111111111",
    legalEntityId: "22222222-2222-2222-2222-222222222222",
  },
  {
    email: "tax.officer@zoikosuite.com",
    password: "Zoiko@Tax2026!",
    name: "Dr. Alistair Vance",
    role: "Tax Governance Lead & MTD Officer",
    domain: "Tax Engine & Authority Filing",
    principalId: "44444444-4444-4444-4444-444444444444",
    tenantId: "11111111-1111-1111-1111-111111111111",
    legalEntityId: "22222222-2222-2222-2222-222222222222",
  },
  {
    email: "cfo@zoikosuite.com",
    password: "Zoiko@Finance2026!",
    name: "Elena Rostova",
    role: "Chief Financial Officer (CFO)",
    domain: "Treasury, General Ledger & Financial Close",
    principalId: "55555555-5555-5555-5555-555555555555",
    tenantId: "11111111-1111-1111-1111-111111111111",
    legalEntityId: "22222222-2222-2222-2222-222222222222",
  },
  {
    email: "legal.counsel@zoikosuite.com",
    password: "Zoiko@Legal2026!",
    name: "James Okafor, Esq.",
    role: "Head of Legal & Governance Counsel",
    domain: "Contracts, Clauses & Board Resolutions",
    principalId: "66666666-6666-6666-6666-666666666666",
    tenantId: "11111111-1111-1111-1111-111111111111",
    legalEntityId: "22222222-2222-2222-2222-222222222222",
  },
  {
    email: "hr.director@zoikosuite.com",
    password: "Zoiko@People2026!",
    name: "Sophie Laurent",
    role: "Director of People & Remuneration",
    domain: "HR, Payroll Runs & Workforce Governance",
    principalId: "77777777-7777-7777-7777-777777777777",
    tenantId: "11111111-1111-1111-1111-111111111111",
    legalEntityId: "22222222-2222-2222-2222-222222222222",
  },
  {
    email: "procurement@zoikosuite.com",
    password: "Zoiko@Commercial2026!",
    name: "Marcus Sterling",
    role: "Head of Procurement & Commercial Ops",
    domain: "Purchase Orders, Spend Controls & Vendor KYC",
    principalId: "88888888-8888-8888-8888-888888888888",
    tenantId: "11111111-1111-1111-1111-111111111111",
    legalEntityId: "22222222-2222-2222-2222-222222222222",
  },
  {
    email: "security.audit@zoikosuite.com",
    password: "Zoiko@Audit2026!",
    name: "Dr. Maya Lin",
    role: "Chief Information Security & Audit Officer",
    domain: "Cryptographic Audit Log, Vault & Compliance",
    principalId: "99999999-9999-9999-9999-999999999999",
    tenantId: "11111111-1111-1111-1111-111111111111",
    legalEntityId: "22222222-2222-2222-2222-222222222222",
  }
];

export const DEMO_IDENTITY = {
  principalId: "33333333-3333-3333-3333-333333333333",
  tenantId: "11111111-1111-1111-1111-111111111111",
  legalEntityId: "22222222-2222-2222-2222-222222222222",
} as const;

export type SessionIdentity = {
  principalId: string;
  tenantId: string;
  legalEntityId: string;
};

export type SessionPayload = {
  email: string;
  name: string;
  role: string;
  iat: number;
} & SessionIdentity;

export function findUserByCredentials(email: string, password: string): GovernedUserAccount | null {
  const normalizedEmail = email.trim().toLowerCase();
  return GOVERNED_USER_ACCOUNTS.find(
    (u) => u.email.toLowerCase() === normalizedEmail && u.password === password
  ) ?? null;
}

export function verifyCredentials(email: string, password: string): boolean {
  return findUserByCredentials(email, password) !== null;
}

export function encodeSession(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
}

export function decodeSession(value: string | undefined | null): SessionPayload | null {
  if (!value) return null;
  try {
    const json = Buffer.from(value, "base64url").toString("utf-8");
    const parsed = JSON.parse(json) as Partial<SessionPayload>;
    if (!parsed?.email) return null;
    return {
      ...DEMO_IDENTITY,
      ...parsed,
    } as SessionPayload;
  } catch {
    return null;
  }
}

export function createSessionForUser(user: GovernedUserAccount): SessionPayload {
  return {
    email: user.email,
    name: user.name,
    role: user.role,
    principalId: user.principalId,
    tenantId: user.tenantId,
    legalEntityId: user.legalEntityId,
    iat: Date.now(),
  };
}

export function createDemoSession(): SessionPayload {
  return createSessionForUser(GOVERNED_USER_ACCOUNTS[0]);
}
