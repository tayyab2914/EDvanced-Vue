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
  env.EMAIL_FROM?.trim() || "EDvanced Vue <no-reply@edvancedvue.local>";

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
            <div style="margin-bottom:4px;font-weight:700;font-size:17px;color:#14304e"><span style="color:#2f9e4f">ED</span>vanced <span style="color:#2f9e4f">V</span>ue</div>
            <div style="margin-bottom:20px;font-size:10px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:#8592a6">School Finance &amp; Analytics</div>
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
    subject: "You've been invited to EDvanced Vue",
    text: `Hi ${name},\n\nAn account has been created for you. Set your password to get started:\n\n${link}\n\nThis link expires in 7 days.`,
    html: renderHtml({
      name,
      heading: "Set your password",
      intro:
        "an account has been created for you on EDvanced Vue. Set your password to get started.",
      buttonLabel: "Set your password",
      url: link,
      expiry: "This link expires in 7 days.",
    }),
  });
}

function appLink(path: string): string {
  return `${env.APP_URL}${path}`;
}

/** Tells a district's admins that an external user is waiting on their approval. */
export async function sendAccessRequestEmail(
  to: string,
  adminName: string,
  externalName: string,
  districtName: string,
): Promise<void> {
  const url = appLink("/users?tab=external");
  await sendEmail({
    to,
    subject: `Access request: ${externalName} — ${districtName}`,
    text: `Hi ${adminName},\n\n${externalName} has requested access to ${districtName}. Review the request and choose their permission level and expiry date:\n\n${url}\n\nNo access is granted until you approve it.`,
    html: renderHtml({
      name: adminName,
      heading: "New access request",
      intro: `${externalName} has requested access to ${districtName}. Review the request and choose their permission level and expiry date. No access is granted until you approve it.`,
      buttonLabel: "Review request",
      url,
      expiry: "You can revoke or change this access at any time.",
    }),
  });
}

/** Tells an external user a district let them in — and for how long. */
export async function sendAccessApprovedEmail(
  to: string,
  name: string,
  districtName: string,
  levelLabel: string,
  expiresLabel: string,
): Promise<void> {
  const url = appLink("/districts");
  await sendEmail({
    to,
    subject: `Your access to ${districtName} has been approved`,
    text: `Hi ${name},\n\n${districtName} has approved your access.\n\nPermission level: ${levelLabel}\nAccess expires: ${expiresLabel}\n\nOpen the district:\n\n${url}`,
    html: renderHtml({
      name,
      heading: `Access to ${districtName} approved`,
      intro: `${districtName} has approved your access. Permission level: ${levelLabel}. Your access expires on ${expiresLabel}.`,
      buttonLabel: "Open district",
      url,
      expiry: `Your access expires on ${expiresLabel}.`,
    }),
  });
}

/** Tells an external user a district turned them down, or cut their access off. */
export async function sendAccessClosedEmail(
  to: string,
  name: string,
  districtName: string,
  kind: "denied" | "revoked",
): Promise<void> {
  const url = appLink("/districts");
  const line =
    kind === "denied"
      ? `${districtName} has declined your access request.`
      : `Your access to ${districtName} has been revoked.`;
  await sendEmail({
    to,
    subject:
      kind === "denied"
        ? `Your access request to ${districtName} was declined`
        : `Your access to ${districtName} has been revoked`,
    text: `Hi ${name},\n\n${line}\n\nYou can still see the districts you have access to here:\n\n${url}`,
    html: renderHtml({
      name,
      heading: kind === "denied" ? "Access request declined" : "Access revoked",
      intro: `${line} Contact the district directly if you believe this is a mistake.`,
      buttonLabel: "View my districts",
      url,
      expiry: "",
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
    subject: "Reset your EDvanced Vue password",
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
