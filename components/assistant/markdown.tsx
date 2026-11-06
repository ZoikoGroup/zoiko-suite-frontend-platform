// Restricted markdown for assistant answers: **bold**, bullet or numbered
// lists, and `inline code`. Everything else is plain text. No HTML is ever
// interpreted and no links are made: links come only from source cards and
// the CTA (Doc01 §12, master prompt §9.3).

import { Fragment, type ReactNode } from "react";

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`)/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

const ITEM = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/;
// STEP is one numbered step ("3. Select Save the limit.").
const STEP = /^\s*\d+[.)]\s+\S/;

export const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

/**
 * The first n words of an already validated answer, line breaks kept, for
 * the typing reveal (Doc 05 §14: only final, validated text is ever shown).
 * An unfinished **bold** is closed so its markers never flash on screen.
 */
export function revealWords(text: string, n: number): string {
  let seen = 0;
  let out = "";
  for (const part of text.split(/(\s+)/)) {
    if (part.trim() === "") {
      if (seen > 0) out += part;
      continue;
    }
    if (seen >= n) break;
    out += part;
    seen++;
  }
  out = out.trimEnd();
  if ((out.match(/\*\*/g) ?? []).length % 2 === 1) out += "**";
  return out;
}

/**
 * Doc 01 §12: a default answer shows at most `max` words before an optional
 * expand. Cuts at a line boundary so a list item is never split; only when
 * the first line alone is longer is it cut mid-line, with an ellipsis. A
 * numbered list of steps is never cut part-way: a visitor following a how-to
 * needs every step, so a started numbered list is kept to its end (up to
 * `max` × 1.5 words) and only what follows it is clamped.
 */
export function clampWords(text: string, max: number): { text: string; clamped: boolean } {
  if (countWords(text) <= max) return { text, clamped: false };
  const kept: string[] = [];
  let used = 0;
  for (const line of text.split("\n")) {
    const n = countWords(line);
    const continuesSteps = STEP.test(line) && kept.length > 0 && STEP.test(kept[kept.length - 1]);
    if (used + n > max && !(continuesSteps && used + n <= max * 1.5)) {
      if (used === 0) {
        const m = ITEM.exec(line);
        const body = m ? m[1] : line;
        const prefix = m ? line.slice(0, line.length - body.length) : "";
        kept.push(prefix + body.split(/\s+/).filter(Boolean).slice(0, max).join(" ") + "…");
      }
      break;
    }
    kept.push(line);
    used += n;
  }
  return { text: kept.join("\n").trimEnd(), clamped: true };
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let items: string[] = [];
  let ordered = false;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(" "))}</p>);
    para = [];
  };
  const flushList = () => {
    if (items.length) {
      const lis = items.map((it, i) => <li key={i}>{inline(it)}</li>);
      // Numbered steps stay numbered: a how-to is followed in order.
      blocks.push(ordered ? <ol key={blocks.length}>{lis}</ol> : <ul key={blocks.length}>{lis}</ul>);
    }
    items = [];
  };
  for (const line of text.split("\n")) {
    const m = ITEM.exec(line);
    if (m) {
      flushPara();
      const step = STEP.test(line);
      if (items.length && step !== ordered) flushList();
      ordered = step;
      items.push(m[1]);
    } else if (line.trim() === "") {
      flushPara();
      flushList();
    } else {
      flushList();
      // A line that introduces a list ("To register a jurisdiction:") is a
      // paragraph of its own, not the tail of the one before it.
      if (line.trim().endsWith(":")) flushPara();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return <div className="za-md">{blocks}</div>;
}
