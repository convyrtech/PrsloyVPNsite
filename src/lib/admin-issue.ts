import { randomBytes } from "crypto";
import {
  getUserByEmail,
  grantSubscriptionByUserId,
  type PublicAuthUser,
} from "@/lib/auth";
import {
  getMarzneshinProxyErrorCode,
  isMarzneshinProxyConfigured,
  issueKey,
  saveSubscriptionRecord,
} from "@/lib/marzneshin-proxy";
import { markReissueHandled } from "@/lib/reissue";
import { writeAuditEntry } from "@/lib/admin-audit";

/* Admin-initiated key issuance.
   ─────────────────────────────
   The operator picks a user (by email) and a period and we drive the same
   partner /external/issue-key the payment flow uses — instead of pasting a
   hand-made URL. Works for comps (no payment required); the audit log keeps
   the reason. A unique `admin-<hex>` payment_id makes each call a fresh
   issuance from the partner's idempotency boundary, so the partner extends
   the existing Marzneshin user (or creates one) and returns the stable URL. */

export class AdminIssueError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = "AdminIssueError";
    this.code = code;
  }
}

export type AdminIssueInput = {
  email: string;
  periodDays: number;
  comp: boolean;
  note: string | null;
  reissueRequestId?: string | null;
};

export type AdminIssueResult = {
  user: PublicAuthUser;
  subscriptionUrl: string;
  action: "issue" | "extend";
};

export async function performAdminIssue(
  input: AdminIssueInput
): Promise<AdminIssueResult> {
  if (!isMarzneshinProxyConfigured()) {
    throw new AdminIssueError("proxy_not_configured");
  }

  const user = await getUserByEmail(input.email);
  if (!user) throw new AdminIssueError("user_not_found");
  if (user.accessStatus === "blocked") {
    throw new AdminIssueError("user_blocked");
  }

  // issue vs extend is a display/audit distinction — the partner endpoint is
  // create-or-extend regardless.
  const action: "issue" | "extend" = user.subscriptionUrl ? "extend" : "issue";
  const paymentId = `admin-${randomBytes(12).toString("hex")}`;

  let result;
  try {
    result = await issueKey({
      paymentId,
      periodDays: input.periodDays,
      userId: user.id,
      email: user.email ?? input.email,
    });
  } catch (err) {
    await writeAuditEntry({
      action,
      targetUserId: user.id,
      targetEmail: user.email,
      periodDays: input.periodDays,
      comp: input.comp,
      note: input.note,
      result: "error",
      detail: getMarzneshinProxyErrorCode(err) ?? "issue_failed",
    });
    throw err;
  }

  await saveSubscriptionRecord(user.id, {
    marzUsername: result.marzUsername,
    subscriptionUrl: result.subscriptionUrl,
    issuedAt: new Date().toISOString(),
    periodDays: input.periodDays,
    paymentId,
    source: "manual-grant",
  });
  const publicUser = await grantSubscriptionByUserId(
    user.id,
    result.subscriptionUrl
  );

  await writeAuditEntry({
    action,
    targetUserId: user.id,
    targetEmail: user.email,
    periodDays: input.periodDays,
    comp: input.comp,
    note: input.note,
    result: "ok",
  });

  // If this issuance answered a user's reissue ticket, close it. Best-effort:
  // a failed close must not undo a successful issue.
  if (input.reissueRequestId) {
    try {
      await markReissueHandled(input.reissueRequestId);
    } catch (err) {
      console.warn(
        "[admin-issue] failed to close reissue ticket",
        input.reissueRequestId,
        err
      );
    }
  }

  return { user: publicUser, subscriptionUrl: result.subscriptionUrl, action };
}
