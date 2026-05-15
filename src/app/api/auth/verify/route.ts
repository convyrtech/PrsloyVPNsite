import { NextResponse } from "next/server";
import { AuthError, getAuthSetupErrorCode, verifyEmailToken } from "@/lib/auth";

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
    const setupError = getAuthSetupErrorCode(err);
    if (setupError) {
      return NextResponse.redirect(`${siteUrl}/${locale}/dashboard?auth=${setupError}`);
    }
    if (err instanceof AuthError) {
      return NextResponse.redirect(`${siteUrl}/${locale}/dashboard?verified=0`);
    }
    console.warn("[auth] verify failed", err);
    return NextResponse.redirect(`${siteUrl}/${locale}/dashboard?verified=0`);
  }
}
