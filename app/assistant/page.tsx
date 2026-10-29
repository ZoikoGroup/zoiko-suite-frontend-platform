import type { Metadata } from "next";

// Public, no-login test page for the ZoikoSuite Assistant. It sits outside the
// admin layout and proxy.ts (which guards /admin only), reads no session and
// renders only a short intro; the widget itself is mounted by the root layout
// on allowlisted public paths (components/assistant/mount.ts).

export const metadata: Metadata = {
  title: "ZoikoSuite Assistant",
  robots: { index: false, follow: false }, // noindex until launch
};

export default function AssistantPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold text-navy-900 dark:text-slate-50">ZoikoSuite Assistant</h1>
      <p className="mt-3 text-slate-700 dark:text-slate-300">
        Ask about ZoikoSuite plans, modules, trust and integrations. The assistant answers from public ZoikoSuite
        information only and can&apos;t see or change any account.
      </p>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Open it with the button in the bottom-right corner.</p>
    </main>
  );
}
