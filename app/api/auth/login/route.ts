import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionForUser,
  encodeSession,
  findUserByCredentials,
  type SessionPayload,
} from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const known = findUserByCredentials(email, password);
  if (!known) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const session: SessionPayload = createSessionForUser(known);

  const response = NextResponse.json({
    success: true,
    identityProvider: "local-credentials",
    user: {
      email: session.email,
      name: session.name,
      role: session.role,
      domain: known.domain,
    },
  });

  response.cookies.set(SESSION_COOKIE, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  return response;
}
