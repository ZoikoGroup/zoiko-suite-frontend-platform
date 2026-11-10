import { beforeEach, describe, expect, it } from "vitest";
import {
  DEVICE_KEY,
  DEVICE_MAX,
  REMEMBER_KEY,
  SESSION_KEY,
  readHistory,
  rememberOn,
  setRemember,
  upsert,
  writeHistory,
  type SavedConversation,
} from "./history";

const convo = (id: string, at: number): SavedConversation => ({ id, startedAt: at, updatedAt: at, turns: [{ q: `q ${id}`, a: "a" }] });

describe("conversation history storage (Doc 02 §10, Doc 06 §11)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("keeps history on this device by default, with no expiry", () => {
    expect(rememberOn()).toBe(true);
    const now = Date.now();
    const yearAgo = now - 365 * 24 * 60 * 60 * 1000;
    writeHistory([convo("new", now), convo("old", yearAgo)], true);
    expect(window.localStorage.getItem(DEVICE_KEY)).not.toBeNull();
    expect(readHistory(true).map((c) => c.id)).toEqual(["new", "old"]);
  });

  it("keeps history in this tab only after opting out", () => {
    setRemember(false);
    expect(rememberOn()).toBe(false);
    writeHistory([convo("a", Date.now())], false);
    expect(window.sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(DEVICE_KEY)).toBeNull();
    setRemember(true);
    expect(rememberOn()).toBe(true);
  });

  it("opting out deletes the device history", () => {
    setRemember(true);
    writeHistory([convo("a", Date.now())], true);
    setRemember(false);
    expect(window.localStorage.getItem(DEVICE_KEY)).toBeNull();
    expect(window.localStorage.getItem(REMEMBER_KEY)).toBe("0");
  });

  it("caps the device list and replaces an updated conversation in place", () => {
    const now = Date.now();
    const many = Array.from({ length: DEVICE_MAX + 5 }, (_, i) => convo(`c${i}`, now - i));
    writeHistory(many, true);
    expect(readHistory(true)).toHaveLength(DEVICE_MAX);
    const list = upsert([convo("a", 1), convo("b", 2)], { ...convo("b", 3), turns: [{ q: "q b", a: "updated" }] });
    expect(list.map((c) => c.id)).toEqual(["b", "a"]);
    expect(list[0].turns[0].a).toBe("updated");
  });
});
