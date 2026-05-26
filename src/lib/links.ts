// "Contact us" surface — public Telegram for support, FAQ links, etc.
export const TELEGRAM_BOT_URL = "https://t.me/prsloy";

// Auth/invite bot — the one the webhook is attached to. Falls back to a
// computed t.me link from the env-configured TELEGRAM_BOT_USERNAME at
// runtime via getInviteBotUrl(); the hardcoded value here is the build-
// time default for places where env isn't read on first paint.
export const INVITE_BOT_FALLBACK_URL = "https://t.me/Prsloy_help_bot";

export const HAPP_DOWNLOAD_URL = "https://www.happ.su/main";
export const HAPP_IMPORT_GUIDE_URL =
  "https://www.happ.su/main/faq/adding-configuration-subscription";
