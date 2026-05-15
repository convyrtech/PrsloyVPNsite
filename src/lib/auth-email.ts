export function buildVerificationEmail({
  locale,
  verifyUrl,
}: {
  locale?: string;
  verifyUrl: string;
}) {
  if (locale === "ru") {
    return {
      subject: "PRSLOY: подтвердите почту",
      text:
        "Привет.\n\n" +
        "Подтвердите почту для аккаунта PRSLOY:\n" +
        `${verifyUrl}\n\n` +
        "Если это были не вы, просто игнорируйте письмо.\n\n" +
        "PRSLOY",
      html:
        "<p>Привет.</p>" +
        "<p>Подтвердите почту для аккаунта PRSLOY:</p>" +
        `<p><a href="${verifyUrl}">${verifyUrl}</a></p>` +
        "<p>Если это были не вы, просто игнорируйте письмо.</p>" +
        "<p>PRSLOY</p>",
    };
  }

  return {
    subject: "PRSLOY: verify your email",
    text:
      "Hi.\n\n" +
      "Verify your PRSLOY account email:\n" +
      `${verifyUrl}\n\n` +
      "If this was not you, just ignore this email.\n\n" +
      "PRSLOY",
    html:
      "<p>Hi.</p>" +
      "<p>Verify your PRSLOY account email:</p>" +
      `<p><a href="${verifyUrl}">${verifyUrl}</a></p>` +
      "<p>If this was not you, just ignore this email.</p>" +
      "<p>PRSLOY</p>",
  };
}
