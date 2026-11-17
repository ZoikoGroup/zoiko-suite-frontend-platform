// Contract guard for the Blocks 6-10 lifecycle actions (lib/lifecycle/catalog.ts).
//
// Run: npm test
//
// 1. Static: the Server Action sends only catalog routes, takes identity from
//    the session, refuses ids that could change the route, and no catalog
//    entry carries an identity field a form could fill.
// 2. Backend: every catalog route is registered, with its method, by the
//    service it names. Read from the backend source (ZOIKO_BACKEND_DIR,
//    default ../zoiko-suite-backend); skipped, not passed, without it.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const BACKEND = path.resolve(process.env.ZOIKO_BACKEND_DIR ?? path.join(ROOT, "..", "zoiko-suite-backend"));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const CATALOG = read("lib/lifecycle/catalog.ts");
const ACTION = read("app/admin/lifecycle-actions.ts");

/** [key, serviceLabel, method, path] for every catalog entry. */
function entries() {
  const out = [];
  for (const m of CATALOG.matchAll(/"([\w.-]+)": \{\s*service: "\w+", serviceLabel: "([\w-]+)", method: "(\w+)",\s*path: "([^"]+)"/g)) {
    out.push([m[1], m[2], m[3], m[4]]);
  }
  for (const m of CATALOG.matchAll(/"(bridge\.[\w-]+)": bridge\("([\w-]+)"/g)) {
    out.push([m[1], "connectivity-api-bridge-svc", "POST", `/v1/bridges/{id}/${m[2]}`]);
  }
  for (const m of CATALOG.matchAll(/"(bank-connection\.[\w-]+)": bank\("([\w-]+)"/g)) {
    out.push([m[1], "banking-connector-svc", "POST", `/v1/banking/connections/{id}/${m[2]}`]);
  }
  return out;
}

const KEYS_IN_USE = new Set(
  ["components", "app"].flatMap((d) => {
    const found = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".tsx")) for (const m of fs.readFileSync(p, "utf8").matchAll(/"([a-z-]+\.[a-z-]+)"/g)) found.push(m[1]);
      }
    };
    walk(path.join(ROOT, d));
    return found;
  }),
);

test("the catalog parses into the expected actions", () => {
  const all = entries();
  assert.ok(all.length >= 60, `expected the lifecycle catalog, parsed ${all.length}`);
  assert.equal(new Set(all.map((e) => e[0])).size, all.length, "duplicate action key");
});

test("every catalog action is offered by a page", () => {
  for (const [key] of entries()) assert.ok(KEYS_IN_USE.has(key), `${key} is not used by any page`);
});

test("catalog routes are /v1 service routes and carry no identity", () => {
  for (const [key, , , p] of entries()) {
    assert.match(p, /^\/v1\/[a-z-]+/, `${key}: ${p}`);
    assert.doesNotMatch(p, /tenant|principal|legal_entity/, `${key}: identity in the route`);
  }
  // No field or fixed value a reader could use to act as someone else.
  assert.doesNotMatch(CATALOG, /name: "(tenant_id|legal_entity_id|principal_id|created_by|actor_id)"/);
  assert.doesNotMatch(CATALOG, /fixed: \{[^}]*(tenant|principal|legal_entity)/);
  for (const m of CATALOG.matchAll(/actorFields: \[([^\]]*)\]/g)) {
    for (const f of m[1].match(/"[^"]+"/g) ?? []) assert.match(f, /_by"$/, `actor field ${f} is not a *_by field`);
  }
  assert.doesNotMatch(CATALOG, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, "hardcoded id in the catalog");
});

test("the Server Action looks actions up in the catalog and takes identity from the session", () => {
  assert.match(ACTION, /^"use server";/);
  assert.match(ACTION, /Object\.prototype\.hasOwnProperty\.call\(LIFECYCLE_ACTIONS, actionKey\)/);
  assert.match(ACTION, /decodeSession\(store\.get\(SESSION_COOKIE\)\?\.value\)/);
  assert.match(ACTION, /if \(!ID_RE\.test\(recordId\)\)/);
  assert.match(ACTION, /body\[f\] = identity\.principalId/, "actor fields must be the session's principal");
  // The body is built only from the catalog's field names.
  assert.match(ACTION, /for \(const f of spec\.fields \?\? \[\]\)/);
  assert.doesNotMatch(ACTION, /\.\.\.values/, "the reader's values must not be spread into the body");
  // A refusal is the service's, not a stand-in success.
  assert.match(ACTION, /if \(!res\.ok\) \{\s*return \{ ok: false/);
});

test("the row buttons send through the Server Action only", () => {
  const src = read("components/admin/shared/RowActions.tsx");
  assert.match(src, /runLifecycleAction\(/);
  assert.doesNotMatch(src, /fetch\(/);
});

// ── Backend routes, read from the service source ─────────────────────────────

function serviceSource(service) {
  const dir = path.join(BACKEND, "services", service, "internal");
  if (!fs.existsSync(dir)) return null;
  let src = "";
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".go") && !e.name.endsWith("_test.go")) src += fs.readFileSync(p, "utf8");
    }
  };
  walk(dir);
  return src;
}

const HAS_BACKEND = serviceSource("forecasting-svc")?.includes("/reforecast") ?? false;
const verb = (m) => m[0] + m.slice(1).toLowerCase();

for (const [key, service, method, p] of entries()) {
  test(
    `service registers ${key}: ${method} ${p} (${service})`,
    { skip: HAS_BACKEND ? false : `no Blocks 6-10 backend checkout at ${BACKEND}` },
    () => {
      const src = serviceSource(service);
      assert.ok(src, `${service} not found`);
      const prefix = p.split("/").slice(0, 3).join("/");
      assert.ok(src.includes(`"${prefix}`), `${service} does not mount ${prefix}`);
      const segs = p.split("/").filter(Boolean);
      const last = segs[segs.length - 1];
      if (/^\{\w+\}$/.test(last)) {
        // A route on the record itself, e.g. DELETE /v1/forecasts/{id}.
        assert.match(src, new RegExp(`${verb(method)}\\("[^"]*\\{\\w+\\}"`), `${service}: no ${method} on a record`);
      } else {
        // Registered as a literal, or as a const prefix plus a literal (p+"/{id}/activate").
        const seg = last.replace(/[-]/g, "\\-");
        assert.match(src, new RegExp(`${verb(method)}\\((\\w+\\+)?"[^"]*/${seg}"`), `${service}: no ${method} .../${last}`);
      }
    },
  );
}
