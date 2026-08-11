// DEV ONLY. Drives the collapsible navigation sidebar through real Chrome.
//
// Width, "labels on hover" and "remembers the preference" are all things the browser
// decides — a media query, a portal's position, a cookie surviving a reload. None of them
// can be asserted by reading the TSX, so this drives headless Chrome over the DevTools
// protocol and measures the sidebar the way a user would see it.
//
// The load-bearing check is FIRST PAINT: the preference is a cookie precisely so the
// server renders the right width, and the only proof of that is the HTML on the wire,
// before any JavaScript has run. That is asserted here with a plain fetch.
//
// Requires a dev server on $BASE (default http://localhost:3000) and Chrome installed.
//
// Run: npm run verify:sidebar
import "dotenv/config";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { SignJWT } from "jose";
import { SIDEBAR_COOKIE } from "../lib/sidebar-preference";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EMAIL = process.env.PRINT_USER ?? "demo.admin@k12finance.local";
const ROUTE = "/dashboard";

/**
 * Must match the `lg:` variants in components/sidebar-shell.tsx.
 *
 * 256 since the M5 rail redesign, and the same number on both sides of `lg` — the mobile
 * drawer and the desktop panel are one width, so this stays one constant.
 */
const EXPANDED_WIDTH = 256;
const RAIL_WIDTH = 68;
/**
 * A label that is in every district sidebar, used as the probe throughout.
 *
 * "Executive", not "Executive Dashboard", since the M5 rail redesign — the nav rows are
 * 14px on a 208px row and the design shortens the first item to fit. It must stay in step
 * with `main[0].label` in app/(district)/layout.tsx or every hover check below fails on a
 * null element rather than on a real regression.
 */
const PROBE_LABEL = "Executive";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean) as string[];

let failures = 0;

function report(label: string, ok: boolean, detail: string) {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${label.padEnd(44)} ${detail}`);
}

// ---------------------------------------------------------------- session

async function mintSession(): Promise<string> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
    }),
  });
  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, role: true, districtId: true },
  });
  if (!user) throw new Error(`No user ${EMAIL}. Set PRINT_USER.`);

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: { userId: user.id, expiresAt },
    select: { id: true },
  });
  const token = await new SignJWT({
    sessionId: session.id,
    userId: user.id,
    role: user.role,
    districtId: user.districtId,
    expiresAt: expiresAt.toISOString(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
  await prisma.$disconnect();
  return token;
}

// ---------------------------------------------------------------- CDP

class Cdp {
  private ws!: WebSocket;
  private id = 0;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private listeners = new Set<(method: string) => void>();

  static async connect(url: string): Promise<Cdp> {
    const cdp = new Cdp();
    cdp.ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      cdp.ws.addEventListener("open", () => resolve(), { once: true });
      cdp.ws.addEventListener("error", () => reject(new Error("CDP socket failed")), {
        once: true,
      });
    });
    cdp.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id != null) {
        const p = cdp.pending.get(msg.id);
        if (!p) return;
        cdp.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      } else {
        for (const l of [...cdp.listeners]) l(msg.method);
      }
    });
    return cdp;
  }

  once(method: string): Promise<void> {
    return new Promise((resolve) => {
      const fn = (m: string) => {
        if (m !== method) return;
        this.listeners.delete(fn);
        resolve();
      };
      this.listeners.add(fn);
    });
  }

  send<T = Record<string, unknown>>(
    method: string,
    params: object = {},
    sessionId?: string,
  ): Promise<T> {
    const id = ++this.id;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
      }, 90_000);
    });
  }

  close() {
    this.ws.close();
  }
}

function launchChrome(): { proc: ChildProcess; port: number } {
  const bin = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!bin) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");
  const port = 9722 + Math.floor(Math.random() * 500);
  const proc = spawn(
    bin,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${mkdtempSync(join(tmpdir(), "sidebar-check-"))}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--hide-scrollbars",
      "--window-size=1600,1000",
      "--force-device-scale-factor=1",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  return { proc, port };
}

async function browserWs(port: number): Promise<string> {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Chrome did not expose a debugging port");
}

// ---------------------------------------------------------------- run

async function main() {
  console.log(`\nSidebar check — ${BASE} as ${EMAIL}\n`);

  const token = await mintSession();

  // ---- 1. FIRST PAINT. Before any browser is involved: does the server-rendered HTML
  // already carry the remembered width? This is the whole reason the preference is a
  // cookie and not localStorage, so it is asserted on the raw bytes.
  const html = async (sidebar: string) =>
    await (
      await fetch(`${BASE}${ROUTE}`, {
        headers: { cookie: `session=${token}; ${SIDEBAR_COOKIE}=${sidebar}` },
        redirect: "manual",
      })
    ).text();

  const collapsedHtml = await html("collapsed");
  report(
    "SSR · collapsed cookie → rail width",
    collapsedHtml.includes(`lg:w-[${RAIL_WIDTH}px]`) &&
      !collapsedHtml.includes(`lg:w-[${EXPANDED_WIDTH}px]`),
    `lg:w-[${RAIL_WIDTH}px] in first paint`,
  );

  const expandedHtml = await html("expanded");
  report(
    "SSR · expanded cookie → full width",
    expandedHtml.includes(`lg:w-[${EXPANDED_WIDTH}px]`) &&
      !expandedHtml.includes(`lg:w-[${RAIL_WIDTH}px]`),
    `lg:w-[${EXPANDED_WIDTH}px] in first paint`,
  );

  const { proc, port } = launchChrome();

  try {
    const cdp = await Cdp.connect(await browserWs(port));
    const { targetId } = await cdp.send<{ targetId: string }>("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = await cdp.send<{ sessionId: string }>("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Network.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send(
      "Network.setCookie",
      { name: "session", value: token, domain: "localhost", path: "/" },
      sessionId,
    );

    const evaluate = async (expression: string): Promise<unknown> => {
      const r = await cdp.send<{
        result?: { value?: unknown };
        exceptionDetails?: { exception?: { description?: string } };
      }>(
        "Runtime.evaluate",
        { expression, returnByValue: true, awaitPromise: true },
        sessionId,
      );
      if (r.exceptionDetails) {
        throw new Error(
          `evaluate failed: ${r.exceptionDetails.exception?.description ?? expression}`,
        );
      }
      return r.result?.value;
    };

    const load = async (url: string) => {
      const loaded = cdp.once("Page.loadEventFired");
      await cdp.send("Page.navigate", { url }, sessionId);
      await loaded;
      // `next dev` compiles the route on first hit, and the dashboard streams its cards in.
      for (let i = 0; i < 240; i++) {
        const ready = await evaluate(
          "!!document.getElementById('app-sidebar') && !!document.querySelector('main')?.innerText.trim()",
        );
        if (ready) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      await evaluate("document.fonts.ready.then(() => 0)");
    };

    /** Reads everything the assertions need in one round-trip, after the width transition. */
    const probe = async () =>
      (await evaluate(`(() => {
        const aside = document.getElementById('app-sidebar');
        const main = document.querySelector('main');
        const link = [...document.querySelectorAll('#app-sidebar nav a')]
          .find(a => a.textContent.trim() === ${JSON.stringify(PROBE_LABEL)});
        // A label is "visible" only if it has boxes AND is not clipped away; getClientRects
        // is empty for display:none, which is what the lg:hidden variant produces.
        const labelSpan = link && [...link.querySelectorAll('span')]
          .find(s => s.textContent.trim() === ${JSON.stringify(PROBE_LABEL)});
        const rect = link?.getBoundingClientRect();
        return {
          width: Math.round(aside.getBoundingClientRect().width),
          labelVisible: !!labelSpan && labelSpan.getClientRects().length > 0,
          mainMaxWidth: getComputedStyle(main).maxWidth,
          toggle: document.querySelector('[aria-controls="app-sidebar"][aria-expanded]')?.getAttribute('aria-expanded'),
          linkCenter: rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null,
          cookie: (document.cookie.match(/edv\\.sidebar=([^;]+)/) || [])[1] ?? null,
          tooltip: document.querySelector('[role="tooltip"]')?.textContent ?? null,
        };
      })()`)) as {
        width: number;
        labelVisible: boolean;
        mainMaxWidth: string;
        toggle: string | null;
        linkCenter: { x: number; y: number } | null;
        cookie: string | null;
        tooltip: string | null;
      };

    /** Clicks the desktop collapse/expand control and waits out the 200ms width transition. */
    const clickToggle = async () => {
      await evaluate(
        `document.querySelector('[aria-label="Collapse sidebar"], [aria-label="Expand sidebar"]').click()`,
      );
      await new Promise((r) => setTimeout(r, 450));
    };

    // ---- 2. DESKTOP, starting expanded.
    await cdp.send(
      "Network.setCookie",
      { name: SIDEBAR_COOKIE, value: "expanded", domain: "localhost", path: "/" },
      sessionId,
    );
    await load(`${BASE}${ROUTE}`);

    let s = await probe();
    report(
      "expanded · sidebar width",
      s.width === EXPANDED_WIDTH,
      `${s.width}px (expected ${EXPANDED_WIDTH})`,
    );
    report("expanded · labels visible", s.labelVisible, `"${PROBE_LABEL}" rendered`);
    report(
      "expanded · toggle reports state",
      s.toggle === "true",
      `aria-expanded=${s.toggle}`,
    );
    const expandedMax = s.mainMaxWidth;

    // ---- 3. COLLAPSE.
    await clickToggle();
    s = await probe();
    report(
      "collapsed · sidebar is a rail",
      s.width === RAIL_WIDTH,
      `${s.width}px (expected ${RAIL_WIDTH})`,
    );
    report(
      "collapsed · labels hidden, icons stay",
      !s.labelVisible && s.linkCenter !== null,
      `label hidden, link still ${s.linkCenter ? "hit-testable" : "MISSING"}`,
    );
    report(
      "collapsed · main column widens",
      parseInt(s.mainMaxWidth, 10) > parseInt(expandedMax, 10),
      `${expandedMax} → ${s.mainMaxWidth}`,
    );
    report(
      "collapsed · toggle reports state",
      s.toggle === "false",
      `aria-expanded=${s.toggle}`,
    );
    report(
      "collapsed · preference written",
      s.cookie === "collapsed",
      `${SIDEBAR_COOKIE}=${s.cookie}`,
    );

    // ---- 4. LABELS ON HOVER. A real pointer move, because React's onMouseEnter is
    // delegated from mouseover — a synthetic .dispatchEvent would prove nothing.
    const target = s.linkCenter!;
    await cdp.send(
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", x: 4, y: 4, buttons: 0 },
      sessionId,
    );
    await cdp.send(
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", x: target.x, y: target.y, buttons: 0 },
      sessionId,
    );
    await new Promise((r) => setTimeout(r, 250));
    s = await probe();
    report(
      "collapsed · label appears on hover",
      s.tooltip === PROBE_LABEL,
      s.tooltip === null ? "no tooltip" : `"${s.tooltip}"`,
    );

    // The tip is portalled to <body> so the scrolling nav cannot clip it — check it is
    // actually beside the rail rather than tucked underneath it.
    const tipLeft = await evaluate(
      `Math.round(document.querySelector('[role="tooltip"]').getBoundingClientRect().left)`,
    );
    report(
      "collapsed · label clears the rail",
      typeof tipLeft === "number" && tipLeft >= RAIL_WIDTH,
      `tooltip left ${tipLeft}px ≥ rail ${RAIL_WIDTH}px`,
    );

    await cdp.send(
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", x: 900, y: 500, buttons: 0 },
      sessionId,
    );
    await new Promise((r) => setTimeout(r, 200));
    s = await probe();
    report("collapsed · label leaves on mouse out", s.tooltip === null, "tooltip removed");

    // ---- 5. THE PREFERENCE SURVIVES A RETURN VISIT.
    await load(`${BASE}${ROUTE}`);
    s = await probe();
    report(
      "reload · still collapsed",
      s.width === RAIL_WIDTH && !s.labelVisible,
      `${s.width}px, labels hidden`,
    );

    // ---- 6. MOBILE. `collapsed` is a desktop idea; the drawer is always full width and
    // must keep its labels, or the cookie would silently wreck the small-screen nav.
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width: 420, height: 820, deviceScaleFactor: 1, mobile: true },
      sessionId,
    );
    await load(`${BASE}${ROUTE}`);
    await evaluate(`document.querySelector('[aria-label="Open navigation"]').click()`);
    await new Promise((r) => setTimeout(r, 400));
    s = await probe();
    report(
      "mobile · drawer ignores the rail",
      s.width === EXPANDED_WIDTH && s.labelVisible,
      `${s.width}px with labels`,
    );
    await cdp.send("Emulation.clearDeviceMetricsOverride", {}, sessionId);

    // ---- 7. EXPANDING AGAIN IS ALSO REMEMBERED.
    await load(`${BASE}${ROUTE}`);
    await clickToggle();
    s = await probe();
    report(
      "expand · width and preference restored",
      s.width === EXPANDED_WIDTH && s.labelVisible && s.cookie === "expanded",
      `${s.width}px, ${SIDEBAR_COOKIE}=${s.cookie}`,
    );
    await load(`${BASE}${ROUTE}`);
    s = await probe();
    report(
      "expand · survives reload",
      s.width === EXPANDED_WIDTH && s.labelVisible,
      `${s.width}px, labels visible`,
    );

    cdp.close();
  } finally {
    proc.kill();
  }

  console.log(
    failures === 0 ? "\nSidebar: all checks passed\n" : `\nSidebar: ${failures} FAILED\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
