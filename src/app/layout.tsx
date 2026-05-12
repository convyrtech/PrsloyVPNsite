import type { ReactNode } from "react";

// Required by Next.js App Router. The actual <html> and <body> live
// in src/app/[locale]/layout.tsx so we have access to the locale
// for the lang attribute and font CSS variables.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
