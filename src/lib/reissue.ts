import { createHash, randomBytes } from "crypto";
import { kvSAdd, kvSet } from "@/lib/kv";

export type ReissueRequest = {
  requestId: string;
  userId: string;
  email: string;
  vpnSlug: string | null;
  subscriptionUrlHash: string | null;
  reason: string | null;
  status: "open";
  createdAt: string;
};

const REISSUE_INDEX_KEY = "access:reissue:index";

function reissueKey(requestId: string) {
  return `access:reissue:${requestId}`;
}

// Store a hash, never the raw URL. Support identifies the account by
// userId / email / vpnSlug; the hash only confirms whether the config
// changed between request and fulfilment.
function hashSubscriptionUrl(value: string | null): string | null {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex");
}

export async function createReissueRequest(input: {
  userId: string;
  email: string;
  vpnSlug: string | null;
  subscriptionUrl: string | null;
  reason?: string | null;
}): Promise<ReissueRequest> {
  const reason = input.reason?.trim();
  const record: ReissueRequest = {
    requestId: randomBytes(12).toString("hex"),
    userId: input.userId,
    email: input.email,
    vpnSlug: input.vpnSlug,
    subscriptionUrlHash: hashSubscriptionUrl(input.subscriptionUrl),
    reason: reason ? reason : null,
    status: "open",
    createdAt: new Date().toISOString(),
  };

  await kvSet(reissueKey(record.requestId), JSON.stringify(record));

  // Best-effort: the request is already saved. A failed index write
  // only hides it from a future operator list.
  try {
    await kvSAdd(REISSUE_INDEX_KEY, record.requestId);
  } catch (err) {
    console.warn("[reissue] failed to add request to index", err);
  }

  return record;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Operator-facing notification. Contains no configuration — only the
// account identifiers support needs to replace the key manually.
export function buildReissueRequestEmail(record: ReissueRequest) {
  const lines = [
    "New key reissue request.",
    "",
    `Request: ${record.requestId}`,
    `User: ${record.userId}`,
    `Email: ${record.email}`,
    `Slug: ${record.vpnSlug ?? "—"}`,
    `Config hash: ${record.subscriptionUrlHash ?? "—"}`,
    `Reason: ${record.reason ?? "—"}`,
    `Created: ${record.createdAt}`,
    "",
    "Replace the configuration manually, then mark the request handled.",
  ];
  return {
    subject: `PRSLOY: key reissue request — ${record.email}`,
    text: lines.join("\n"),
    html: lines
      .map((line) => (line === "" ? "<br/>" : `<p>${escapeHtml(line)}</p>`))
      .join(""),
  };
}
