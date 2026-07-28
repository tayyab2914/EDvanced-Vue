// DEV ONLY. Drives the global filter bar through real Chrome and watches for the wait.
//
// The thing under test is a state that exists only BETWEEN two renders: from the click that
// applies a filter until the server's re-render lands. Nothing about it can be asserted by
// reading the TSX — whether `useTransition` actually stays pending across an App Router
// navigation is a runtime question, and the answer changed once already (Next's own
// `loading.tsx` does NOT fire when only the query string changes, which is the whole reason
// this feedback had to be built by hand).
//
// So the check is a fast poll: click, then sample the DOM every 25ms and record whether the
// busy state was ever observed before the new page arrived. A regression that silently drops
// the transition — a stray `router.push` outside `startTransition`, say — makes the window
// never open, and this goes red.
//
// Requires a dev server on $BASE (default http://localhost:3000) and Chrome installed.
//
// Run: npm run verify:filters
import "dotenv/config";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { SignJWT } from "jose";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EMAIL = process.env.PRINT_USER ?? "demo.admin@k12finance.local";
const ROUTE = "/dashboard";

/** How long a `loadCore` may take before the check gives up waiting for it. */
const SETTLE_MS = 40_000;
/** Fast enough to catch a wait that turns out to be short. */
const POLL_MS = 25;

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
  const port = 9222 + Math.floor(Math.random() * 500);
  const proc = spawn(
    bin,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${mkdtempSync(join(tmpdir(), "filter-check-"))}`,
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

/** What one sample of the page looks like. */
interface Busy {
  /** `<main aria-busy>` — the dimmed content and the screen-reader statement. */
  mainBusy: boolean;
  /** The dim itself, so a detached `aria-busy` cannot pass this alone. */
  dimmed: boolean;
  /** The strip across the top of the window. */
  bar: boolean;
  /** What the filter trigger says right now — "Filters" / "Applying…". */
  trigger: string;
  /** What the reset control says — "Clear filters" / "Clearing…" / null when absent. */
  reset: string | null;
  url: string;
}

async function main() {
  console.log(`\nFilter loading check — ${BASE} as ${EMAIL}\n`);

  const token = await mintSession();
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
      // Self-contained, because the helpers below are installed only once a document has
      // one — this is the wait for that document.
      for (let i = 0; i < 240; i++) {
        const ready = await evaluate(`!!document.querySelector('main')?.innerText.trim()
          && [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Filters')`);
        if (ready) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    };

    /**
     * The helpers, installed once per document.
     *
     * Selected by ROLE and TEXT, never by class name: the whole point of this check is that
     * it keeps working when the styling changes, and a `.animate-busy-sweep` selector would
     * turn a CSS rename into a red test about nothing. The one exception is the strip itself,
     * which has no text and no role — it is found by its animation class, which IS its
     * identity.
     */
    const install = () =>
      evaluate(`(() => {
        window.filterTrigger = () => [...document.querySelectorAll('button')]
          .find(b => /^(Filters|Applying…)/.test(b.textContent.trim()));
        window.resetButton = () => [...document.querySelectorAll('button')]
          .find(b => /^(Clear filters|Clearing…)$/.test(b.textContent.trim()));
        window.sample = () => {
          const main = document.querySelector('main');
          return {
            mainBusy: main?.getAttribute('aria-busy') === 'true',
            dimmed: !!main && Number(getComputedStyle(main).opacity) < 0.95,
            bar: !!document.querySelector('.animate-busy-sweep'),
            trigger: window.filterTrigger()?.textContent.trim() ?? '',
            reset: window.resetButton()?.textContent.trim() ?? null,
            url: location.search,
          };
        };
        return 0;
      })()`);

    const sample = async () => (await evaluate("window.sample()")) as Busy;

    /**
     * Clicks, then samples until the page settles — returning the busiest thing it saw.
     *
     * The peak, not the state at any one moment: the wait is over as soon as the server
     * answers, and a check that sampled once would be timing-dependent on how fast that was.
     */
    const clickAndWatch = async (click: string) => {
      const before = (await sample()).url;
      await evaluate(click);

      let sawBusy = false;
      let sawDim = false;
      let sawBar = false;
      let sawTrigger = "";
      let sawReset: string | null = null;
      let settled: Busy | null = null;

      for (let waited = 0; waited < SETTLE_MS; waited += POLL_MS) {
        const s = await sample();
        if (s.mainBusy) {
          sawBusy = true;
          if (s.dimmed) sawDim = true;
          if (s.bar) sawBar = true;
          if (/Applying/.test(s.trigger)) sawTrigger = s.trigger;
          if (s.reset && /Clearing/.test(s.reset)) sawReset = s.reset;
        }
        // Settled = the URL changed AND nothing is pending any more.
        if (s.url !== before && !s.mainBusy) {
          settled = s;
          break;
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }

      return { sawBusy, sawDim, sawBar, sawTrigger, sawReset, settled, before };
    };

    // ---- 1. THE RESTING STATE. Nothing may claim to be loading on a page that is not.
    await load(`${BASE}${ROUTE}`);
    await install();
    const idle = await sample();
    report(
      "idle · nothing claims to be loading",
      // `startsWith`, not equality: the trigger carries its own count badge and chevron.
      !idle.mainBusy && !idle.bar && idle.trigger.startsWith("Filters"),
      `main aria-busy=${idle.mainBusy}, strip=${idle.bar}, trigger="${idle.trigger}"`,
    );

    // ---- 2. APPLYING A FILTER. Open the panel, tick the first fund, Apply.
    await evaluate("window.filterTrigger().click()");
    await new Promise((r) => setTimeout(r, 250));
    await evaluate(`[...document.querySelectorAll('[role="dialog"] button')]
      .find(b => b.textContent.includes('Fund Code')).click()`);
    await new Promise((r) => setTimeout(r, 250));
    const ticked = await evaluate(`(() => {
      const box = document.querySelector('[role="group"] input[type=checkbox], [role="dialog"] input[type=checkbox]');
      if (!box) return null;
      box.click();
      return box.closest('label')?.innerText.trim() ?? 'a fund';
    })()`);
    report("panel · a fund can be ticked", ticked !== null, String(ticked ?? "nothing to tick"));

    const applied = await clickAndWatch(
      `[...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.trim() === 'Apply').click()`,
    );
    report(
      "apply · the main column reports busy",
      applied.sawBusy,
      applied.sawBusy ? "main[aria-busy=true] observed" : "the wait was never announced",
    );
    report("apply · and is dimmed while it waits", applied.sawDim, "computed opacity < 0.95");
    report("apply · the progress strip appears", applied.sawBar, "top-of-window strip observed");
    report(
      "apply · the trigger says what it is doing",
      applied.sawTrigger !== "",
      applied.sawTrigger || 'the button never read "Applying…"',
    );
    report(
      "apply · and the filter actually lands",
      /funds=/.test(applied.settled?.url ?? ""),
      applied.settled?.url ?? "never settled",
    );
    report(
      "apply · the page is not left dimmed",
      applied.settled !== null && !applied.settled.mainBusy && !applied.settled.bar,
      applied.settled ? "aria-busy cleared, strip gone" : "never settled",
    );

    // ---- 3. CLEARING. The client asked for the same feedback on the way back out.
    await install();
    const beforeClear = await sample();
    report(
      "clear · the control is offered",
      beforeClear.reset === "Clear filters",
      `reset reads "${beforeClear.reset}"`,
    );

    const cleared = await clickAndWatch("window.resetButton().click()");
    report(
      "clear · the main column reports busy",
      cleared.sawBusy,
      cleared.sawBusy ? "main[aria-busy=true] observed" : "the wait was never announced",
    );
    report("clear · and is dimmed while it waits", cleared.sawDim, "computed opacity < 0.95");
    report("clear · the progress strip appears", cleared.sawBar, "top-of-window strip observed");
    report(
      "clear · the control says what it is doing",
      cleared.sawReset !== null,
      cleared.sawReset ?? 'the button never read "Clearing…"',
    );
    report(
      "clear · and the filter actually goes",
      !/funds=/.test(cleared.settled?.url ?? "funds="),
      cleared.settled?.url === "" ? "(no query)" : (cleared.settled?.url ?? "never settled"),
    );
    report(
      "clear · the page is not left dimmed",
      cleared.settled !== null && !cleared.settled.mainBusy && !cleared.settled.bar,
      cleared.settled ? "aria-busy cleared, strip gone" : "never settled",
    );

    cdp.close();
  } finally {
    proc.kill();
  }

  console.log(
    failures === 0
      ? "\nFilter loading: all checks passed\n"
      : `\nFilter loading: ${failures} FAILED\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
