import { createHash, randomBytes } from "crypto";
import {
  getIndexedIds,
  kvGet,
  kvListPushCapped,
  kvListRange,
  kvSAdd,
  kvSet,
  kvSRem,
} from "@/lib/kv";

/* Reissue request lifecycle
   ─────────────────────────
   create ──> status: open ──> SADD  access:reissue:index   (open set)
                  │
   markHandled ───┤  status: handled, handledAt set
                  └─> LPUSH access:reissue:handled (capped)  +  SREM open set

   listReissueRequests reads the open set in full (the live queue) and only
   a bounded recent slice of the handled list — handled history never grows
   the read cost. A handled record still found in the open set (created
   before this split existed) is migrated lazily on read. */

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

const REISSUE_OPEN_INDEX_KEY = "access:reissue:index";
const REISSUE_INDEX_SYNCED_KEY = "access:reissue:index:synced";
const REISSUE_HANDLED_LIST_KEY = "access:reissue:handled";
const REISSUE_KEY_PREFIX = "access:reissue:";
const REISSUE_HANDLED_CAP = 50;
const REISSUE_HANDLED_FETCH = 12;

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

async function getReissueRequest(requestId: string): Promise<ReissueRequest | null> {
  const raw = await kvGet(reissueKey(requestId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ReissueRequest;
  } catch (err) {
    console.warn("[reissue] corrupt request record skipped", requestId, err);
    return null;
  }
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
  // only hides it from the operator list.
  try {
    await kvSAdd(REISSUE_OPEN_INDEX_KEY, record.requestId);
  } catch (err) {
    console.warn("[reissue] failed to add request to open index", err);
  }

  return record;
}

export async function markReissueHandled(requestId: string): Promise<ReissueRequest> {
  const record = await getReissueRequest(requestId);
  if (!record) throw new ReissueError("not_found");
  if (record.status === "handled") return record;

  record.status = "handled";
  record.handledAt = new Date().toISOString();
  await kvSet(reissueKey(record.requestId), JSON.stringify(record));

  // Push to the handled list before removing from the open set: a failure
  // between the two leaves the request visible in both lists (read-side
  // dedup handles it) rather than lost from both.
  await kvListPushCapped(REISSUE_HANDLED_LIST_KEY, record.requestId, REISSUE_HANDLED_CAP);
  await kvSRem(REISSUE_OPEN_INDEX_KEY, record.requestId);

  return record;
}

const byCreatedDesc = (a: ReissueRequest, b: ReissueRequest) =>
  b.createdAt.localeCompare(a.createdAt);

function dedupById(records: ReissueRequest[]): ReissueRequest[] {
  const seen = new Map<string, ReissueRequest>();
  for (const record of records) {
    if (!seen.has(record.requestId)) seen.set(record.requestId, record);
  }
  return Array.from(seen.values());
}

export async function listReissueRequests(): Promise<ReissueRequest[]> {
  const openIds = await getIndexedIds({
    indexKey: REISSUE_OPEN_INDEX_KEY,
    keyPrefix: REISSUE_KEY_PREFIX,
    syncFlagKey: REISSUE_INDEX_SYNCED_KEY,
    excludeKeys: [
      REISSUE_OPEN_INDEX_KEY,
      REISSUE_INDEX_SYNCED_KEY,
      REISSUE_HANDLED_LIST_KEY,
    ],
  });
  const handledIds = Array.from(
    new Set(await kvListRange(REISSUE_HANDLED_LIST_KEY, 0, REISSUE_HANDLED_FETCH - 1))
  );

  const [openCandidates, handledCandidates] = await Promise.all([
    Promise.all(openIds.map((id) => getReissueRequest(id))),
    Promise.all(handledIds.map((id) => getReissueRequest(id))),
  ]);

  const open: ReissueRequest[] = [];
  const stale: ReissueRequest[] = [];
  for (const record of openCandidates) {
    if (!record) continue;
    if (record.status === "handled") stale.push(record);
    else open.push(record);
  }

  // Lazily migrate requests handled before the open/handled split existed.
  if (stale.length > 0) {
    await Promise.all(
      stale.map(async (record) => {
        try {
          await kvListPushCapped(
            REISSUE_HANDLED_LIST_KEY,
            record.requestId,
            REISSUE_HANDLED_CAP
          );
          await kvSRem(REISSUE_OPEN_INDEX_KEY, record.requestId);
        } catch (err) {
          console.warn("[reissue] failed to migrate handled request", record.requestId, err);
        }
      })
    );
  }

  const handled = dedupById([
    ...handledCandidates.filter((r): r is ReissueRequest => r !== null),
    ...stale,
  ]);

  return [...open.sort(byCreatedDesc), ...handled.sort(byCreatedDesc)];
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
