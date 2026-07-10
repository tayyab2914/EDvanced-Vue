// Verifies SMTP is wired up. Uses the SMTP_* vars from .env if SMTP_HOST is set;
// otherwise sends via a throwaway Ethereal test inbox and prints a preview URL.
// Usage: npm run test:smtp -- you@example.com
import "dotenv/config";
import nodemailer from "nodemailer";

async function main() {
  const host = process.env.SMTP_HOST?.trim();
  let transporter: ReturnType<typeof nodemailer.createTransport>;
  let ethereal = false;

  if (host) {
    const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
    const secure = process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === "true"
      : port === 465;
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    console.log(`Using configured SMTP: ${host}:${port} (secure=${secure})`);
  } else {
    const acct = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: acct.smtp.host,
      port: acct.smtp.port,
      secure: acct.smtp.secure,
      auth: { user: acct.user, pass: acct.pass },
    });
    ethereal = true;
    console.log(
      `SMTP_HOST not set — using a throwaway Ethereal inbox (${acct.smtp.host}:${acct.smtp.port}).`,
    );
  }

  await transporter.verify();
  console.log("✔ SMTP connection verified.");

  const to = process.argv[2] || "recipient@example.com";
  const info = await transporter.sendMail({
    from:
      process.env.EMAIL_FROM ||
      "K-12 School Finance <no-reply@k12finance.local>",
    to,
    subject: "K-12 Finance — SMTP test",
    text: "This confirms SMTP is wired up.\n\nExample link: http://localhost:3000/reset-password?token=demo",
    html: "<p>This confirms <b>SMTP</b> is wired up.</p>",
  });

  console.log(`✔ Sent to ${to} — messageId ${info.messageId}`);
  if (ethereal) {
    console.log(`  Preview: ${nodemailer.getTestMessageUrl(info)}`);
  }
}

main().catch((e) => {
  console.error("✗ SMTP test failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
