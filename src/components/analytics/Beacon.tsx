"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { sendBeacon, sendBeaconForce } from "@/lib/beacon";
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

  // Back/forward navigation can restore a page from the browser's bfcache,
  // in which case usePathname() does NOT re-fire (the React tree is reused
  // wholesale). The pageshow event fires with persisted=true in exactly
  // that case — catch it so the restored pageview gets counted.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onPageshow(e: PageTransitionEvent) {
      if (!e.persisted) return;
      captureUtmFromUrl();
      sendBeaconForce(window.location.pathname, window.location.search);
    }
    window.addEventListener("pageshow", onPageshow);
    return () => window.removeEventListener("pageshow", onPageshow);
  }, []);

  return null;
}
