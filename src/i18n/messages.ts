import en from "../../messages/en.json";
import ru from "../../messages/ru.json";
import type { Locale } from "./routing";

// Static map ensures Webpack/Turbopack can tree-shake & bundle messages
// without runtime path resolution. Add new locales here.
export const messages: Record<Locale, typeof en> = {
  en,
  ru,
};

export type Messages = typeof en;
