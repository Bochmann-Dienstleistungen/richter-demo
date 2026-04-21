/**
 * Cloudflare Worker — Richter Automation Hub
 * Webhook-Endpunkt für Formspree → Auto-Reply + Google Sheets Log
 *
 * ENV VARS (Cloudflare Dashboard → Settings → Variables):
 *   BREVO_API_KEY       — Brevo (Sendinblue) API Key
 *   SHEETS_WEBHOOK_URL  — Make.com Webhook URL für Google Sheets
 *   SILVIO_EMAIL        — ga-richter@freenet.de
 */

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return corsResponse();
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const { name, email, phone, thema, rueckruf, nachricht } = body;

    // 1. Auto-Reply an Kunden
    await sendEmail(env.BREVO_API_KEY, {
      to: email,
      toName: name,
      subject: 'Ihre Anfrage bei Versicherungsmakler Richter — Eingang bestätigt',
      html: buildAutoReplyHtml({ name, thema, rueckruf }),
    });

    // 2. Benachrichtigung an Silvio
    await sendEmail(env.BREVO_API_KEY, {
      to: env.SILVIO_EMAIL,
      toName: 'Silvio Richter',
      subject: `Neue Anfrage: ${name} — ${thema || 'Allgemein'}`,
      html: buildNotificationHtml({ name, email, phone, thema, rueckruf, nachricht }),
    });

    // 3. Lead in Google Sheets (via Make.com Webhook)
    if (env.SHEETS_WEBHOOK_URL) {
      await fetch(env.SHEETS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datum: new Date().toLocaleDateString('de-DE'),
          name, email, phone: phone || '–',
          thema: thema || 'Allgemeine Anfrage',
          rueckruf: rueckruf || 'Flexibel',
          nachricht: nachricht || '–',
          status: 'Neu',
          quelle: 'Website',
        }),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  },
};

// ── Brevo Email Sender ──────────────────────────────────────────
async function sendEmail(apiKey, { to, toName, subject, html }) {
  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Versicherungsmakler Richter', email: 'ga-richter@freenet.de' },
      to: [{ email: to, name: toName }],
      subject,
      htmlContent: html,
    }),
  });
}

// ── HTML Templates ──────────────────────────────────────────────
function buildAutoReplyHtml({ name, thema, rueckruf }) {
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f0;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f0;padding:40px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%">

  <!-- Header -->
  <tr><td style="background:#1C2B4A;padding:32px 40px">
    <p style="margin:0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#B8965A;margin-bottom:6px">Versicherungsmakler</p>
    <h1 style="margin:0;font-size:22px;color:#ffffff;font-weight:600">Silvio Richter GmbH</h1>
    <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.5)">Zwickau · Seit 1990</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:40px">
    <p style="margin:0 0 20px;font-size:16px;color:#1C2B4A">Guten Tag ${name},</p>
    <p style="margin:0 0 16px;color:#4a5568;line-height:1.7">
      vielen Dank für Ihre Anfrage. Ich habe sie erhalten und werde mich <strong>persönlich bei Ihnen melden</strong>.
    </p>
    ${thema ? `<p style="margin:0 0 16px;color:#4a5568;line-height:1.7">Ihr Thema: <strong>${thema}</strong></p>` : ''}
    ${rueckruf ? `<p style="margin:0 0 16px;color:#4a5568;line-height:1.7">Gewünschte Rückrufzeit: <strong>${rueckruf}</strong></p>` : ''}
    <p style="margin:24px 0 16px;color:#4a5568;line-height:1.7">
      Falls Sie zwischenzeitlich eine dringende Frage haben, erreichen Sie mich direkt:
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 32px">
      <tr>
        <td style="padding-right:12px">
          <a href="tel:0376042424" style="display:inline-block;background:#1C2B4A;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:4px;font-size:14px;font-weight:600">
            037604 / 2424
          </a>
        </td>
        <td>
          <a href="https://wa.me/4915254190819" style="display:inline-block;background:#25d366;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:4px;font-size:14px;font-weight:600">
            WhatsApp
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#4a5568;line-height:1.7">
      Mit freundlichen Grüßen,<br>
      <strong style="color:#1C2B4A">Silvio Richter</strong><br>
      <span style="font-size:13px;color:#888">Versicherungsmakler Richter GmbH · Sportplatzweg 2 · 08058 Zwickau</span>
    </p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f8f6f2;padding:20px 40px;text-align:center">
    <p style="margin:0;font-size:11px;color:#999">
      Diese E-Mail ist eine automatische Eingangsbestätigung. Bitte antworten Sie nicht auf diese Nachricht.<br>
      <a href="https://bochmann-dienstleistungen.github.io/richter-demo/" style="color:#B8965A">www.versicherungsmakler-richter.de</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

function buildNotificationHtml({ name, email, phone, thema, rueckruf, nachricht }) {
  return `<!DOCTYPE html>
<html lang="de">
<body style="font-family:Arial,sans-serif;padding:32px;background:#f4f4f0">
<div style="background:#fff;border-radius:8px;padding:32px;max-width:560px;border-left:4px solid #B8965A">
  <h2 style="margin:0 0 24px;color:#1C2B4A">Neue Website-Anfrage</h2>
  <table cellpadding="6" cellspacing="0" style="width:100%">
    <tr><td style="color:#888;font-size:13px;width:120px">Name</td><td style="font-weight:600;color:#1C2B4A">${name}</td></tr>
    <tr><td style="color:#888;font-size:13px">E-Mail</td><td><a href="mailto:${email}" style="color:#B8965A">${email}</a></td></tr>
    <tr><td style="color:#888;font-size:13px">Telefon</td><td style="color:#1C2B4A">${phone || '–'}</td></tr>
    <tr><td style="color:#888;font-size:13px">Thema</td><td style="color:#1C2B4A">${thema || 'Allgemeine Anfrage'}</td></tr>
    <tr><td style="color:#888;font-size:13px">Rückruf</td><td style="color:#1C2B4A;font-weight:600">${rueckruf || 'Flexibel'}</td></tr>
    ${nachricht ? `<tr><td style="color:#888;font-size:13px;vertical-align:top">Nachricht</td><td style="color:#1C2B4A">${nachricht}</td></tr>` : ''}
  </table>
  <div style="margin-top:24px">
    <a href="mailto:${email}" style="display:inline-block;background:#1C2B4A;color:#fff;text-decoration:none;padding:12px 24px;border-radius:4px;font-size:14px;font-weight:600;margin-right:10px">Antworten</a>
    ${phone ? `<a href="tel:${phone.replace(/\s/g,'')}" style="display:inline-block;background:#B8965A;color:#fff;text-decoration:none;padding:12px 24px;border-radius:4px;font-size:14px;font-weight:600">Zurückrufen</a>` : ''}
  </div>
</div>
</body></html>`;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
function corsResponse() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
