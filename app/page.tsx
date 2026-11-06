import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

export default async function RootPage() {
  const cookieStore = await cookies();
  const authed = decodeSession(cookieStore.get(SESSION_COOKIE)?.value) !== null;
  redirect(authed ? "/admin" : "/login");
}
