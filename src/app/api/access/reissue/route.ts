import { NextResponse } from "next/server";
import { getAuthSetupErrorCode, getCurrentUser } from "@/lib/auth";
import { sendTransactionalEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { buildReissueRequestEmail, createReissueRequest } from "@/lib/reissue";

export const runtime = "nodejs";

const REISSUE_LIMIT = 3;
const REISSUE_WINDOW_SECONDS = 3600;
const MAX_REASON_LENGTH = 500;

type ReissueBody = {
  reason?: unknown;
};

export async function POST(req: Request) {
  let body: ReissueBody = {};
  try {
    body = (await req.json()) as ReissueBody;
  } catch {
    body = {};
  }

  const reason =
    typeof body.reason === "string"
      ? body.reason.trim().slice(0, MAX_REASON_LENGTH)
      : "";

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "authentication_required" },
        { status: 401 }
      );
    }

    // A reissue only makes sense once a configuration exists. This also
    // mirrors the dashboard, which only shows the button when hasKey.
    if (!user.subscriptionUrl) {
      return NextResponse.json(
        { ok: false, error: "access_not_issued" },
        { status: 409 }
      );
    }

    const limit = await rateLimit(
      "reissue",
      user.id,
      REISSUE_LIMIT,
      REISSUE_WINDOW_SECONDS
    );
    if (!limit.ok) {
      return NextResponse.json(
        { ok: false, error: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
      );
    }

    const record = await createReissueRequest({
      userId: user.id,
      email: user.email,
      vpnSlug: user.vpnSlug,
      subscriptionUrl: user.subscriptionUrl,
      reason,
    });

    // Best-effort operator notification. The request is already stored;
    // a missing recipient or a Resend outage must not fail the response.
    const notifyEmail = process.env.WAITLIST_NOTIFY_EMAIL?.trim();
    if (notifyEmail) {
      const message = buildReissueRequestEmail(record);
      const sent = await sendTransactionalEmail({
        to: notifyEmail,
        subject: message.subject,
        html: message.html,
        text: message.text,
        replyTo: record.email,
      });
      if (!sent.ok && !sent.skipped) {
        console.warn("[reissue] notification email failed", sent.error);
      }
    }

    return NextResponse.json({ ok: true, status: "open" });
  } catch (err) {
    const setupError = getAuthSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json({ ok: false, error: setupError }, { status: 503 });
    }
    console.warn("[reissue] request failed", err);
    return NextResponse.json({ ok: false, error: "reissue_failed" }, { status: 500 });
  }
}
