"use server";

// Server Actions for the ZoikoSuite public assistant (public-ai-svc).
//
// Server Actions are reachable by direct POST, so each one verifies the
// console session first — the widget lives inside the signed-in console.
// The assistant itself stays anonymous: nothing about the console user is
// forwarded to public-ai-svc.
//
// The session grant lives only in the widget's React state (never in
// localStorage or a cookie) and is passed back here per call.

import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  createPublicAISession,
  endPublicAISession,
  getPublicAIConfig,
  recordPublicAIHandoff,
  sendPublicAIFeedback,
  sendPublicAITurn,
  type FeedbackRating,
  type FeedbackReason,
} from "@/lib/api/public-ai";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGE = 2000;

async function requireConsoleSession() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
}

export async function startAssistantSession(idempotencyKey: string) {
  await requireConsoleSession();
  if (!UUID.test(idempotencyKey)) throw new Error("Invalid request");
  return createPublicAISession(idempotencyKey);
}

export async function askAssistant(grant: string, sessionId: string, clientTurnId: string, message: string) {
  await requireConsoleSession();
  const text = typeof message === "string" ? message.trim() : "";
  if (!UUID.test(clientTurnId) || !grant || !sessionId || text.length === 0 || text.length > MAX_MESSAGE) {
    throw new Error("Invalid request");
  }
  return sendPublicAITurn(grant, sessionId, clientTurnId, text);
}

export async function endAssistantSession(grant: string, sessionId: string) {
  await requireConsoleSession();
  if (!grant || !sessionId) return { ok: true as const, data: undefined };
  return endPublicAISession(grant, sessionId);
}

export async function loadAssistantConfig() {
  await requireConsoleSession();
  return getPublicAIConfig();
}

const RATINGS = new Set(["useful", "not_useful"]);
const REASONS = new Set(["", "incorrect", "incomplete", "not_relevant", "unclear", "other"]);
const ROUTE_KEY = /^[a-z_]{1,40}$/;

export async function rateAssistantAnswer(grant: string, sessionId: string, turnId: string, rating: FeedbackRating, reason: FeedbackReason) {
  await requireConsoleSession();
  if (!grant || !sessionId || !turnId || !RATINGS.has(rating) || !REASONS.has(reason)) throw new Error("Invalid request");
  return sendPublicAIFeedback(grant, sessionId, turnId, rating, reason);
}

export async function recordAssistantHandoff(grant: string, sessionId: string, routeKey: string) {
  await requireConsoleSession();
  if (!grant || !sessionId || !ROUTE_KEY.test(routeKey)) throw new Error("Invalid request");
  return recordPublicAIHandoff(grant, sessionId, routeKey);
}
