import { getRequestConfig, type GetRequestConfigParams } from "next-intl/server";
import type { AbstractIntlMessages } from "next-intl";
import { routing, type Locale } from "./routing";
import { messages } from "./messages";

function isValidLocale(value: string | undefined): value is Locale {
  return (
    typeof value === "string" &&
    (routing.locales as readonly string[]).includes(value)
  );
}

export default getRequestConfig(async ({ requestLocale }: GetRequestConfigParams) => {
  const requested = await requestLocale;
  const locale: Locale = isValidLocale(requested)
    ? requested
    : routing.defaultLocale;

  // Cast to AbstractIntlMessages — next-intl's strict type forbids arrays
  // of objects, but we use array values via t.raw() for FAQ items etc.
  return {
    locale,
    messages: messages[locale] as unknown as AbstractIntlMessages,
  };
});
