import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionForUser,
  encodeSession,
  findUserByCredentials,
} from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const user = findUserByCredentials(email, password);
  if (!user) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({
    success: true,
    user: {
      email: user.email,
      name: user.name,
      role: user.role,
      domain: user.domain,
    }
  });

  response.cookies.set(SESSION_COOKIE, encodeSession(createSessionForUser(user)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  return response;
}
