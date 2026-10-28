import "server-only";

// Sends email through Resend (RESEND_API_KEY + EMAIL_FROM, a verified sender).
// Without them, digests stay in the app only.

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function sendEmail(msg: { to: string; subject: string; text: string; html: string }): Promise<void> {
  if (!emailConfigured()) throw new Error("Email isn't set up (RESEND_API_KEY, EMAIL_FROM).");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Resend returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
