import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth";

export default async function RootPage() {
  const cookieStore = await cookies();
  const authed = Boolean(cookieStore.get(SESSION_COOKIE)?.value);
  redirect(authed ? "/admin" : "/login");
}
