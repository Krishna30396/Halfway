// Server-only: email alerts for friends without push (iPhone browsers, etc.).
// Sends through any SMTP account — by default Gmail with an app password:
//   SMTP_USER=you@gmail.com  SMTP_PASS=<16-letter app password>
// Optional: SMTP_HOST (smtp.gmail.com), SMTP_PORT (465), EMAIL_FROM.
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';

let transport = null;
export function emailReady() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return false;
  if (!transport) {
    const port = Number(process.env.SMTP_PORT) || 465;
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS.replace(/\s+/g, '') },
    });
  }
  return true;
}

function secret() {
  return process.env.EMAIL_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
}

/** Signs a user id so the "stop these emails" link can't be forged for someone else. */
export function unsubscribeToken(userId) {
  return crypto.createHmac('sha256', secret()).update(`unsub:${userId}`).digest('base64url').slice(0, 32);
}

export function validUnsubscribe(userId, token) {
  if (!secret() || typeof token !== 'string') return false;
  const want = Buffer.from(unsubscribeToken(userId));
  const got = Buffer.from(token);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

const esc = (t) =>
  String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * `subject` defaults to the title; `details` is a list of [label, value] rows
 * (place, distances…); `map` = { lat, lng } adds a "See it on a map" link;
 * `button` labels the main link.
 */
export async function sendAlertEmail({ to, userId, title, subject, text, details = [], map, button = 'Open Halfway', url, origin }) {
  const link = new URL(url, origin).toString();
  const stop = new URL(`/api/email-alerts/stop?u=${userId}&t=${unsubscribeToken(userId)}`, origin).toString();
  const from = process.env.EMAIL_FROM || `Halfway <${process.env.SMTP_USER}>`;
  const mapLink = map
    ? `https://www.openstreetmap.org/?mlat=${map.lat}&mlon=${map.lng}#map=17/${map.lat}/${map.lng}`
    : null;
  const rows = details.filter(([, v]) => v != null && v !== '');
  const detailText = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  const detailHtml = rows.length
    ? `<tr><td style="padding-top:16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F1EA;border-radius:10px">${rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:10px 14px;font-size:13px;color:#6B7A70;width:42%">${esc(k)}</td><td style="padding:10px 14px;font-size:14px;font-weight:600;color:#1E2A24">${esc(v)}</td></tr>`
        )
        .join('')}</table></td></tr>`
    : '';
  await transport.sendMail({
    from,
    to,
    subject: subject || title,
    text: `${title}\n\n${text}${detailText ? `\n\n${detailText}` : ''}${mapLink ? `\nMap: ${mapLink}` : ''}\n\n${button}: ${link}\n\n—\nStop these emails: ${stop}`,
    headers: { 'List-Unsubscribe': `<${stop}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    html: `<!doctype html><html><body style="margin:0;background:#F3F1EA;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1E2A24">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#ffffff;border-radius:14px;padding:28px">
<tr><td style="font-size:13px;letter-spacing:.12em;font-weight:700;color:#2F6F5E">HALFWAY</td></tr>
<tr><td style="padding-top:14px;font-size:21px;font-weight:700;line-height:1.3">${esc(title)}</td></tr>
<tr><td style="padding-top:8px;font-size:15px;line-height:1.5;color:#4A5850">${esc(text)}</td></tr>
${detailHtml}
<tr><td style="padding-top:22px"><a href="${esc(link)}" style="display:inline-block;background:#2F6F5E;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">${esc(button)}</a>${
      mapLink
        ? `<a href="${esc(mapLink)}" style="display:inline-block;margin-left:14px;color:#2F6F5E;font-weight:600;font-size:14px;text-decoration:underline">See it on a map</a>`
        : ''
    }</td></tr>
</table>
<p style="max-width:460px;font-size:12px;color:#6B7A70;line-height:1.5;margin:16px auto 0">You get these because this address was added for email alerts in Halfway.
<a href="${esc(stop)}" style="color:#6B7A70">Stop these emails</a></p>
</td></tr></table></body></html>`,
  });
}
