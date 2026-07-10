import "server-only";
import nodemailer from "nodemailer";
import { env } from "@/lib/env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

type Mailer = ReturnType<typeof nodemailer.createTransport>;

const SMTP_HOST = env.SMTP_HOST?.trim();
const SMTP_CONFIGURED = !!SMTP_HOST;
const FROM =
  env.EMAIL_FROM?.trim() || "K-12 School Finance <no-reply@k12finance.local>";

const globalForMail = globalThis as unknown as { mailer?: Mailer };

function getTransporter(): Mailer | null {
  if (!SMTP_CONFIGURED) return null;
  if (globalForMail.mailer) return globalForMail.mailer;

  const port = env.SMTP_PORT ? Number(env.SMTP_PORT) : 587;
  // Port 465 uses implicit TLS; 587/25 use STARTTLS (secure: false). Override with SMTP_SECURE.
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465;

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" }
      : undefined,
  });

  if (env.NODE_ENV !== "production") globalForMail.mailer = transporter;
  return transporter;
}

function logToConsole(msg: EmailMessage, tag: string): void {
  console.log(
    [
      "",
      `📧 ───────────────────────── EMAIL (${tag}) ─────────────────────────`,
      `To:      ${msg.to}`,
      `Subject: ${msg.subject}`,
      "",
      msg.text,
      "──────────────────────────────────────────────────────────────────",
      "",
    ].join("\n"),
  );
}

/**
 * Sends an email over SMTP when configured (SMTP_HOST set); otherwise prints it
 * to the server console so flows stay testable without a mail server. Never
 * throws into the caller — a delivery failure is logged (with the message body,
 * so any link can still be recovered) but does not break the user action.
 */
export async function sendEmail(msg: EmailMessage): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    logToConsole(msg, "dev — SMTP not configured");
    return;
  }
  try {
    await transporter.sendMail({
      from: FROM,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
  } catch (err) {
    console.error("[email] SMTP delivery failed:", err);
    logToConsole(msg, "SMTP FAILED — link below for manual recovery");
  }
}

export function buildTokenLink(rawToken: string): string {
  return `${env.APP_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(opts: {
  name: string;
  heading: string;
  intro: string;
  buttonLabel: string;
  url: string;
  expiry: string;
}): string {
  const url = escapeHtml(opts.url);
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#eef1f5;font-family:Arial,Helvetica,sans-serif;color:#16202e">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e2e7ef;border-radius:12px">
          <tr><td style="padding:28px 32px">
            <div style="font-weight:700;font-size:16px;color:#2f6bf6;margin-bottom:20px">K&#8211;12 School Finance</div>
            <div style="font-size:20px;font-weight:600;margin-bottom:12px">${escapeHtml(opts.heading)}</div>
            <p style="font-size:14px;line-height:1.6;color:#475069;margin:0 0 22px">Hi ${escapeHtml(opts.name)},<br/>${escapeHtml(opts.intro)}</p>
            <a href="${url}" style="display:inline-block;background:#2f6bf6;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px">${escapeHtml(opts.buttonLabel)}</a>
            <p style="font-size:12px;line-height:1.6;color:#8592a6;margin:22px 0 0">Or paste this link into your browser:<br/><a href="${url}" style="color:#2f6bf6;word-break:break-all">${url}</a></p>
            <p style="font-size:12px;color:#8592a6;margin:18px 0 0">${escapeHtml(opts.expiry)}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function sendInviteEmail(
  to: string,
  name: string,
  link: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: "You've been invited to the K-12 School Finance Platform",
    text: `Hi ${name},\n\nAn account has been created for you. Set your password to get started:\n\n${link}\n\nThis link expires in 7 days.`,
    html: renderHtml({
      name,
      heading: "Set your password",
      intro:
        "an account has been created for you on the K-12 School Finance Platform. Set your password to get started.",
      buttonLabel: "Set your password",
      url: link,
      expiry: "This link expires in 7 days.",
    }),
  });
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  link: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: "Reset your K-12 School Finance Platform password",
    text: `Hi ${name},\n\nWe received a request to reset your password. Use the link below (valid for 1 hour):\n\n${link}\n\nIf you didn't request this, you can safely ignore this email.`,
    html: renderHtml({
      name,
      heading: "Reset your password",
      intro:
        "we received a request to reset your password. Choose a new one using the button below.",
      buttonLabel: "Reset password",
      url: link,
      expiry:
        "This link expires in 1 hour. If you didn't request this, you can ignore this email.",
    }),
  });
}
