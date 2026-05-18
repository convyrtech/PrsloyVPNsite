import { NextResponse } from "next/server";
import { isAdminAuthorized, isAdminConfigured } from "@/lib/admin-auth";
import { getAuthSetupErrorCode } from "@/lib/auth";
import {
  listReissueRequests,
  markReissueHandled,
  ReissueError,
} from "@/lib/reissue";

export const runtime = "nodejs";

type PatchBody = {
  action?: unknown;
  requestId?: unknown;
};

export async function GET(req: Request) {
  const blocked = guardAdmin(req);
  if (blocked) return blocked;

  try {
    const requests = await listReissueRequests();
    return NextResponse.json({ ok: true, requests });
  } catch (err) {
    const setupError = getAuthSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json({ ok: false, error: setupError }, { status: 503 });
    }
    console.warn("[admin] list reissue requests failed", err);
    return NextResponse.json({ ok: false, error: "reissue_list_failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const blocked = guardAdmin(req);
  if (blocked) return blocked;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "mark_handled";
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "request_id_required" }, { status: 400 });
  }
  if (action !== "mark_handled") {
    return NextResponse.json({ ok: false, error: "unsupported_action" }, { status: 400 });
  }

  try {
    const request = await markReissueHandled(requestId);
    return NextResponse.json({ ok: true, request });
  } catch (err) {
    const setupError = getAuthSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json({ ok: false, error: setupError }, { status: 503 });
    }
    if (err instanceof ReissueError && err.code === "not_found") {
      return NextResponse.json({ ok: false, error: "request_not_found" }, { status: 404 });
    }
    console.warn("[admin] update reissue request failed", err);
    return NextResponse.json({ ok: false, error: "reissue_update_failed" }, { status: 500 });
  }
}

function guardAdmin(req: Request): NextResponse | null {
  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return null;
}
