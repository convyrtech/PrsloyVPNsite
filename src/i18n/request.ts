import { getRequestConfig } from "next-intl/server";
import { routing, type Locale } from "./routing";
import { messages } from "./messages";

function isValidLocale(value: string | undefined): value is Locale {
  return (
    typeof value === "string" &&
    (routing.locales as readonly string[]).includes(value)
  );
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = isValidLocale(requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: messages[locale],
  };
});
