"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { sendBeacon } from "@/lib/beacon";

/* Mounted once at the locale layout. Fires a pageview beacon on the
   initial hydration and on every subsequent client-side navigation.
   The path/search read happens inside the effect so it always reflects
   the current URL (next/navigation's usePathname only drives the
   re-run; window.location is the source of truth). */
export function Beacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    sendBeacon(window.location.pathname, window.location.search);
  }, [pathname]);

  return null;
}
