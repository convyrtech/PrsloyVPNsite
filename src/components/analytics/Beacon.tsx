"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { sendBeacon } from "@/lib/beacon";
import { captureUtmFromUrl } from "@/lib/client-utm";

/* Mounted once at the locale layout. Fires a pageview beacon on the
   initial hydration and on every subsequent client-side navigation.
   The path/search read happens inside the effect so it always reflects
   the current URL (next/navigation's usePathname only drives the
   re-run; window.location is the source of truth).

   Also captures utm_source into sessionStorage on every navigation
   where it appears, so forms downstream of the landing page (register,
   payment) can read it on submit without preserving query params
   through every Link in the app. */
export function Beacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    captureUtmFromUrl();
    sendBeacon(window.location.pathname, window.location.search);
  }, [pathname]);

  return null;
}
