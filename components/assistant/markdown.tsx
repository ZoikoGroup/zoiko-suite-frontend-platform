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

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let items: string[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(" "))}</p>);
    para = [];
  };
  const flushList = () => {
    if (items.length) {
      blocks.push(
        <ul key={blocks.length}>
          {items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </ul>,
      );
    }
    items = [];
  };
  for (const line of text.split("\n")) {
    const m = ITEM.exec(line);
    if (m) {
      flushPara();
      items.push(m[1]);
    } else if (line.trim() === "") {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return <div className="za-md">{blocks}</div>;
}
