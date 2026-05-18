import { createHash, randomBytes } from "crypto";
import { kvGet, kvSAdd, kvScanKeys, kvSet, kvSMembers } from "@/lib/kv";

export type ReissueRequest = {
  requestId: string;
  userId: string;
  email: string;
  vpnSlug: string | null;
  subscriptionUrlHash: string | null;
  reason: string | null;
  status: "open" | "handled";
  createdAt: string;
  handledAt?: string;
};

const REISSUE_INDEX_KEY = "access:reissue:index";
const REISSUE_KEY_PREFIX = "access:reissue:";

export class ReissueError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = "ReissueError";
    this.code = code;
  }
}

function reissueKey(requestId: string) {
  return `${REISSUE_KEY_PREFIX}${requestId}`;
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

export async function listReissueRequests(): Promise<ReissueRequest[]> {
  const indexedIds = await kvSMembers(REISSUE_INDEX_KEY);
  const discoveredIds = await discoverReissueRequestIds();
  const ids = Array.from(new Set([...indexedIds, ...discoveredIds]));
  if (ids.length === 0) return [];

  if (discoveredIds.length > 0) {
    await Promise.all(
      discoveredIds.map(async (id) => {
        try {
          await kvSAdd(REISSUE_INDEX_KEY, id);
        } catch (err) {
          console.warn("[reissue] failed to reindex request", id, err);
        }
      })
    );
  }

  const requests = await Promise.all(ids.map((id) => getReissueRequest(id)));
  return requests
    .filter((request): request is ReissueRequest => request !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function markReissueHandled(requestId: string): Promise<ReissueRequest> {
  const record = await getReissueRequest(requestId);
  if (!record) throw new ReissueError("not_found");

  if (record.status !== "handled") {
    record.status = "handled";
    record.handledAt = new Date().toISOString();
    await kvSet(reissueKey(record.requestId), JSON.stringify(record));
  }

  return record;
}

async function getReissueRequest(requestId: string): Promise<ReissueRequest | null> {
  const raw = await kvGet(reissueKey(requestId));
  return raw ? (JSON.parse(raw) as ReissueRequest) : null;
}

async function discoverReissueRequestIds(): Promise<string[]> {
  try {
    const keys = await kvScanKeys(`${REISSUE_KEY_PREFIX}*`);
    return keys
      .filter((key) => key.startsWith(REISSUE_KEY_PREFIX))
      .map((key) => key.slice(REISSUE_KEY_PREFIX.length))
      .filter((id) => id !== "index");
  } catch (err) {
    console.warn("[reissue] failed to scan request keys", err);
    return [];
  }
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
