// Display label for an account when an admin or a header needs a single
// human-readable handle. Email wins when present; otherwise @username;
// otherwise the raw Telegram id; otherwise an em-dash placeholder.
export function displayIdentity(user: {
  email: string | null;
  telegramUsername: string | null;
  telegramId: string | null;
}): string {
  if (user.email) return user.email;
  if (user.telegramUsername) return `@${user.telegramUsername}`;
  if (user.telegramId) return `tg:${user.telegramId}`;
  return "—";
}
