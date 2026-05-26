// HTML email template for the invite-code delivery channel.
// Nothing-style aesthetic: black background, monospace, code displayed
// as the centerpiece artifact in a bracketed frame, single CTA button.
//
// Email-safe HTML: tables for layout, inline styles only — Gmail web,
// Outlook desktop, iOS Mail all dislike <style>, flexbox, modern CSS.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildInviteEmail(input: {
  code: string;
  registerUrl: string;
  locale?: string;
}): { subject: string; html: string; text: string } {
  const isRu = (input.locale ?? "ru").startsWith("ru");
  const code = escapeHtml(input.code);
  const url = escapeHtml(input.registerUrl);

  const t = isRu
    ? {
        subject: `Твоё приглашение в PRSLOY · ${input.code}`,
        eyebrow: "PRSLOY · ЗАКРЫТАЯ БЕТА",
        title: "ПРИГЛАШЕНИЕ ПРИНЯТО",
        codeLabel: "КОД",
        ttl: "Код активен 24 часа.",
        cta: "ЗАРЕГИСТРИРОВАТЬСЯ",
        manual: "Или открой в браузере:",
        footer: "PRSLOY · prsloy.online",
      }
    : {
        subject: `Your PRSLOY invitation · ${input.code}`,
        eyebrow: "PRSLOY · CLOSED BETA",
        title: "INVITATION ACCEPTED",
        codeLabel: "CODE",
        ttl: "Code is valid for 24 hours.",
        cta: "REGISTER",
        manual: "Or open in your browser:",
        footer: "PRSLOY · prsloy.online",
      };

  const text = [
    t.eyebrow,
    "",
    t.title,
    "",
    `${t.codeLabel}: ${input.code}`,
    "",
    t.ttl,
    "",
    `${t.cta}: ${input.registerUrl}`,
    "",
    "—",
    t.footer,
  ].join("\n");

  // Single root table — most Outlook-safe wrapper. All visuals carved in
  // black/white per Nothing aesthetic; we intentionally avoid colour
  // accents so the email matches the site's monochrome language.
  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="${isRu ? "ru" : "en"}">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(t.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#000000;color:#f5f5f5;font-family:'SF Mono','Menlo','Consolas',monospace;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#000000;width:100%;">
  <tr>
    <td align="center" style="padding:48px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
        <!-- EYEBROW -->
        <tr>
          <td style="padding:0 0 32px 0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#666666;">
            ${escapeHtml(t.eyebrow)}
          </td>
        </tr>
        <!-- TITLE -->
        <tr>
          <td style="padding:0 0 32px 0;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#f5f5f5;font-weight:bold;">
            ${escapeHtml(t.title)}
          </td>
        </tr>
        <!-- CODE BLOCK -->
        <tr>
          <td style="padding:0 0 8px 0;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#666666;">
            ${escapeHtml(t.codeLabel)}
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 32px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0a0a0a;border:1px solid #2a2a2a;">
              <tr>
                <td align="center" style="padding:32px 16px;font-size:32px;letter-spacing:0.12em;color:#f5f5f5;font-weight:bold;font-family:'SF Mono','Menlo','Consolas',monospace;">
                  ${code}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- TTL -->
        <tr>
          <td style="padding:0 0 32px 0;font-size:13px;line-height:1.6;color:#999999;">
            ${escapeHtml(t.ttl)}
          </td>
        </tr>
        <!-- CTA -->
        <tr>
          <td style="padding:0 0 32px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="background:#f5f5f5;border-radius:9999px;">
                  <a href="${url}" style="display:inline-block;padding:14px 32px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#000000;text-decoration:none;font-weight:bold;font-family:'SF Mono','Menlo','Consolas',monospace;">
                    [ ${escapeHtml(t.cta)} → ]
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- MANUAL LINK -->
        <tr>
          <td style="padding:0 0 8px 0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#666666;">
            ${escapeHtml(t.manual)}
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 48px 0;font-size:12px;color:#999999;word-break:break-all;">
            <a href="${url}" style="color:#999999;text-decoration:underline;">${url}</a>
          </td>
        </tr>
        <!-- DIVIDER -->
        <tr>
          <td style="padding:0 0 16px 0;border-top:1px solid #2a2a2a;"></td>
        </tr>
        <!-- FOOTER -->
        <tr>
          <td style="font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#666666;">
            ${escapeHtml(t.footer)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject: t.subject, html, text };
}
