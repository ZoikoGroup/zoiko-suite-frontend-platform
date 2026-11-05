// The browser half of a passkey ceremony. identity-context-svc sends WebAuthn
// options as JSON with binary fields base64url-encoded; navigator.credentials
// wants ArrayBuffers, and answers with a PublicKeyCredential whose binary
// fields go back base64url-encoded. Nothing here verifies anything: the
// service checks the challenge, origin, signature and counter.

function fromB64u(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function toB64u(buf: ArrayBuffer | null | undefined): string | null {
  if (!buf) return null;
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type Descriptor = { id: string; type: string; transports?: string[] };

function descriptors(list: unknown): PublicKeyCredentialDescriptor[] | undefined {
  if (!Array.isArray(list)) return undefined;
  return (list as Descriptor[]).map((d) => ({
    id: fromB64u(d.id),
    type: "public-key",
    transports: d.transports as AuthenticatorTransport[] | undefined,
  }));
}

/** Whether this browser can run a passkey ceremony at all. */
export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function" && !!navigator.credentials;
}

/** navigator.credentials.create for the service's creation options; the credential as the service reads it. */
export async function createPasskey(options: { publicKey: Record<string, unknown> }): Promise<unknown> {
  const pk = options.publicKey as Record<string, unknown> & {
    challenge: string;
    user: { id: string; name: string; displayName: string };
  };
  const cred = (await navigator.credentials.create({
    publicKey: {
      ...(pk as unknown as PublicKeyCredentialCreationOptions),
      challenge: fromB64u(pk.challenge),
      user: { ...pk.user, id: fromB64u(pk.user.id) },
      excludeCredentials: descriptors(pk.excludeCredentials),
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("cancelled");
  const r = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: toB64u(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: toB64u(r.clientDataJSON),
      attestationObject: toB64u(r.attestationObject),
      transports: typeof r.getTransports === "function" ? r.getTransports() : [],
    },
  };
}

/** navigator.credentials.get for the service's request options; the assertion as the service reads it. */
export async function getPasskeyAssertion(options: { publicKey: Record<string, unknown> }): Promise<unknown> {
  const pk = options.publicKey as Record<string, unknown> & { challenge: string };
  const cred = (await navigator.credentials.get({
    publicKey: {
      ...(pk as unknown as PublicKeyCredentialRequestOptions),
      challenge: fromB64u(pk.challenge),
      allowCredentials: descriptors(pk.allowCredentials),
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("cancelled");
  const r = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: toB64u(cred.rawId),
    type: cred.type,
    response: {
      authenticatorData: toB64u(r.authenticatorData),
      clientDataJSON: toB64u(r.clientDataJSON),
      signature: toB64u(r.signature),
      userHandle: toB64u(r.userHandle),
    },
  };
}
