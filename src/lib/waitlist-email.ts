type WaitlistEmailInput = {
  email: string;
  locale?: string;
  period?: string;
  payment?: string;
  ts: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildWaitlistConfirmationEmail({ locale }: WaitlistEmailInput) {
  if (locale === "ru") {
    return {
      subject: "PRSLOY: заявка получена",
      text:
        "Привет.\n\n" +
        "Мы получили заявку на доступ к PRSLOY. Когда откроем следующий пул ключей, пришлем инструкцию на эту почту.\n\n" +
        "Оплата сейчас не нужна. Если письмо пришло случайно, просто игнорируй его.\n\n" +
        "PRSLOY",
      html:
        "<p>Привет.</p>" +
        "<p>Мы получили заявку на доступ к PRSLOY. Когда откроем следующий пул ключей, пришлем инструкцию на эту почту.</p>" +
        "<p>Оплата сейчас не нужна. Если письмо пришло случайно, просто игнорируй его.</p>" +
        "<p>PRSLOY</p>",
    };
  }

  return {
    subject: "PRSLOY: request received",
    text:
      "Hi.\n\n" +
      "We received your PRSLOY access request. When the next key pool opens, we'll send instructions to this email.\n\n" +
      "No payment is needed right now. If this was not you, just ignore this email.\n\n" +
      "PRSLOY",
    html:
      "<p>Hi.</p>" +
      "<p>We received your PRSLOY access request. When the next key pool opens, we'll send instructions to this email.</p>" +
      "<p>No payment is needed right now. If this was not you, just ignore this email.</p>" +
      "<p>PRSLOY</p>",
  };
}

export function buildWaitlistNotifyEmail({
  email,
  locale,
  period,
  payment,
  ts,
}: WaitlistEmailInput) {
  const rows = [
    ["email", email],
    ["locale", locale ?? ""],
    ["period", period ?? ""],
    ["payment", payment ?? ""],
    ["ts", ts],
  ].filter(([, value]) => value);

  const text =
    "New PRSLOY access request\n\n" +
    rows.map(([key, value]) => `${key}: ${value}`).join("\n");

  const htmlRows = rows
    .map(
      ([key, value]) =>
        `<tr><td><b>${escapeHtml(key)}</b></td><td>${escapeHtml(value)}</td></tr>`
    )
    .join("");

  return {
    subject: "New PRSLOY access request",
    text,
    html: `<p>New PRSLOY access request</p><table>${htmlRows}</table>`,
  };
}
