import { NextResponse } from "next/server";
import { AuthError, isAuthSetupError, verifyEmailToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const locale = url.searchParams.get("locale") === "ru" ? "ru" : "en";
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || url.origin).replace(/\/$/, "");

  try {
    await verifyEmailToken(token);
    return NextResponse.redirect(`${siteUrl}/${locale}/dashboard?verified=1`);
  } catch (err) {
    if (isAuthSetupError(err)) {
      return NextResponse.redirect(`${siteUrl}/${locale}/dashboard?auth=not_configured`);
    }
    if (err instanceof AuthError) {
      return NextResponse.redirect(`${siteUrl}/${locale}/dashboard?verified=0`);
    }
    console.warn("[auth] verify failed", err);
    return NextResponse.redirect(`${siteUrl}/${locale}/dashboard?verified=0`);
  }
}
