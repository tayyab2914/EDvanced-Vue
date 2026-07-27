// DEV ONLY. Prints every dashboard's one-page summary through real Chrome and asserts that
// each one lands on a single sheet.
//
// The client's complaint was "it's currently printing 5 pages", and that is not a thing a
// human can check by reading CSS — page breaks are decided by the print engine at paper
// width, against fonts and SVG that have already been measured. So this drives headless
// Chrome over the DevTools protocol, asks it for the same PDF the browser's own Save as PDF
// produces (`preferCSSPageSize`, so the route's `@page` rule is the one that applies), and
// counts the pages in the result.
//
// Requires a dev server on $BASE (default http://localhost:3000) and Chrome installed.
//
// Run: npm run verify:print
import "dotenv/config";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { SignJWT } from "jose";
import { SUMMARY_VIEWS } from "../lib/dashboard/summary";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EMAIL = process.env.PRINT_USER ?? "demo.admin@k12finance.local";
const OUT = join(process.cwd(), ".next", "print-check");

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
  console.log(`${ok ? "  ok  " : " FAIL "} ${label.padEnd(46)} ${detail}`);
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

/**
 * A DevTools protocol reply. Shaped by the protocol rather than by anything this file can
 * state, so call sites narrow it themselves — `as { data: string }` at the one place that
 * wants the PDF bytes is honest where a blanket `any` on `send` would not be.
 */
type CdpResult = Record<string, unknown>;

/** The measured sheet, as the page reports it back for the screenshot clip. */
interface SheetBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The fitter's applied scale, or "1"/"normal" when it did not need to shrink anything. */
  zoom: string;
}

class Cdp {
  private ws!: WebSocket;
  private id = 0;
  private pending = new Map<
    number,
    { resolve: (v: CdpResult) => void; reject: (e: Error) => void }
  >();
  private listeners: ((method: string, params: unknown) => void)[] = [];

  static async connect(url: string): Promise<Cdp> {
    const cdp = new Cdp();
    cdp.ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      cdp.ws.addEventListener("open", () => resolve(), { once: true });
      cdp.ws.addEventListener("error", () => reject(new Error("CDP socket failed")), { once: true });
    });
    cdp.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id != null) {
        const p = cdp.pending.get(msg.id);
        if (!p) return;
        cdp.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error)})`));
        else p.resolve(msg.result);
      } else {
        for (const l of cdp.listeners) l(msg.method, msg.params);
      }
    });
    return cdp;
  }

  on(fn: (method: string, params: unknown) => void) {
    this.listeners.push(fn);
  }

  /** `Runtime.evaluate`, returning the value itself rather than the protocol envelope. */
  async evaluate(expression: string, sessionId: string): Promise<unknown> {
    const r = (await this.send(
      "Runtime.evaluate",
      { expression, returnByValue: true },
      sessionId,
    )) as { result?: { value?: unknown } };
    return r.result?.value;
  }

  send(method: string, params: object = {}, sessionId?: string): Promise<CdpResult> {
    const id = ++this.id;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
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
      `--user-data-dir=${mkdtempSync(join(tmpdir(), "print-check-"))}`,
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

/**
 * Pages in a Chrome-produced PDF.
 *
 * Chrome writes an uncompressed page tree, so the root `/Type /Pages` node carries a
 * `/Count`. Falling back to counting leaf `/Type /Page` objects keeps this honest if that
 * ever changes.
 */
function pdfPageCount(pdf: Buffer): number {
  const text = pdf.toString("latin1");
  const counts = [...text.matchAll(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/g)].map((m) =>
    Number(m[1]),
  );
  if (counts.length) return Math.max(...counts);
  return (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

// ---------------------------------------------------------------- run

async function main() {
  console.log(`\nPrint check — ${BASE} as ${EMAIL}\n`);
  mkdirSync(OUT, { recursive: true });

  const token = await mintSession();
  const { proc, port } = launchChrome();

  try {
    const cdp = await Cdp.connect(await browserWs(port));
    const { targetId } = (await cdp.send("Target.createTarget", { url: "about:blank" })) as {
      targetId: string;
    };
    const { sessionId } = (await cdp.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    })) as { sessionId: string };

    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Network.enable", {}, sessionId);
    await cdp.send("Network.setCookie", {
      name: "session",
      value: token,
      domain: "localhost",
      path: "/",
    }, sessionId);

    // The summary routes open the print dialogue themselves. Headless ignores it, but
    // stubbing keeps this deterministic across Chrome channels.
    await cdp.send(
      "Page.addScriptToEvaluateOnNewDocument",
      { source: "window.print = function () {};" },
      sessionId,
    );

    for (const view of SUMMARY_VIEWS) {
      const url = `${BASE}${view.href}`;
      const loaded = new Promise<void>((resolve) => {
        const off = (method: string) => {
          if (method === "Page.loadEventFired") resolve();
        };
        cdp.on(off);
      });
      await cdp.send("Page.navigate", { url }, sessionId);
      await loaded;

      // A dashboard streams: the shell paints first and the cards arrive with the data.
      // Printing the skeleton would report a comfortable one page and prove nothing, so
      // wait for the summary root with no pulse placeholders left in it.
      let settled = false;
      // Generous, because the first hit on a route in `next dev` compiles it.
      for (let i = 0; i < 300 && !settled; i++) {
        settled = Boolean(
          await cdp.evaluate(
            "!!document.querySelector('main')?.innerText.trim() && !document.querySelector('.animate-pulse')",
            sessionId,
          ),
        );
        if (!settled) await new Promise((r) => setTimeout(r, 500));
      }

      // Fonts and the server-rendered SVG settle a frame or two after that; measuring
      // before they do prints a page that was never laid out.
      await cdp.send(
        "Runtime.evaluate",
        { expression: "document.fonts.ready.then(() => 0)", awaitPromise: true },
        sessionId,
      );
      await new Promise((r) => setTimeout(r, 600));

      if (!settled) {
        report(view.label, false, `never finished loading · ${view.href}`);
        continue;
      }

      const text = String(
        (await cdp.evaluate("document.body.innerText.slice(0, 60)", sessionId)) ?? "",
      );

      const { data } = (await cdp.send(
        "Page.printToPDF",
        {
          landscape: true,
          printBackground: true,
          preferCSSPageSize: true,
          transferMode: "ReturnAsBase64",
        },
        sessionId,
      )) as { data: string };
      const pdf = Buffer.from(data, "base64");
      const pages = pdfPageCount(pdf);
      writeFileSync(join(OUT, `${view.key}.pdf`), pdf);

      // A PNG of the sheet as well. One page is necessary and not sufficient — a sheet that
      // fits because the fitter scaled it to illegibility, or one whose chart collapsed to a
      // sliver in a narrow column, still passes a page count. The image is what a human
      // checks, and the sheet is WYSIWYG, so this IS the printed page.
      const boxJson = await cdp.evaluate(
        `(() => {
          const el = document.querySelector('.sheet-page');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const fit = document.querySelector('[data-sheet-fit]');
          return JSON.stringify({
            x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height,
            zoom: fit ? getComputedStyle(fit).zoom : '1',
          });
        })()`,
        sessionId,
      );
      const rect: SheetBox | null = typeof boxJson === "string" ? JSON.parse(boxJson) : null;

      let zoomNote = "";
      if (rect) {
        zoomNote = rect.zoom === "1" || rect.zoom === "normal" ? "" : ` · fit ${rect.zoom}`;
        const shot = (await cdp.send(
          "Page.captureScreenshot",
          {
            format: "png",
            captureBeyondViewport: true,
            clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1.5 },
          },
          sessionId,
        )) as { data: string };
        writeFileSync(join(OUT, `${view.key}.png`), Buffer.from(shot.data, "base64"));
      }

      // A route that quietly falls back to the full dashboard would otherwise be reported
      // as a print failure with no clue why, so say which of the two it is.
      const isSheet = Boolean(
        await cdp.evaluate("!!document.querySelector('[data-sheet]')", sessionId),
      );

      const ok = pages === 1 && isSheet && !/sign in|not found/i.test(text);
      report(
        view.label,
        ok,
        `${pages} page${pages === 1 ? "" : "s"}${isSheet ? "" : " · NO SHEET"}${zoomNote} · ${view.href}`,
      );
    }

    cdp.close();
  } finally {
    proc.kill();
  }

  console.log(
    failures === 0
      ? `\nAll ${SUMMARY_VIEWS.length} summaries print to one page. PDFs in ${OUT}\n`
      : `\n${failures} summar${failures === 1 ? "y" : "ies"} did not fit one page. PDFs in ${OUT}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

await main();
