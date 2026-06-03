import { randomBytes } from "crypto";
import { kvListPushCapped, kvListRange } from "@/lib/kv";

/* Admin audit log.
   ────────────────
   Every mutating admin action (issue / extend / block / unblock / manual
   grant) appends one record here. With a single ADMIN_SECRET there is no
   "who", so we capture what / to whom / when — enough to reconstruct why a
   free (comp) key went out. Stored as a capped LPUSH list: newest first,
   bounded read cost, no per-record keys to scan. */

const AUDIT_KEY = "admin:audit";
const AUDIT_CAP = 500;

export type AdminAuditAction =
  | "issue"
  | "extend"
  | "manual_grant"
  | "block"
  | "unblock";

export type AdminAuditEntry = {
  id: string;
  ts: string;
  action: AdminAuditAction;
  targetUserId: string;
  targetEmail: string | null;
  periodDays?: number;
  comp?: boolean;
  note?: string | null;
  result: "ok" | "error";
  detail?: string;
};

export async function writeAuditEntry(
  entry: Omit<AdminAuditEntry, "id" | "ts">
): Promise<void> {
  const full: AdminAuditEntry = {
    ...entry,
    id: randomBytes(8).toString("hex"),
    ts: new Date().toISOString(),
  };
  // Best-effort: an audit write must never block or fail the action it
  // records. A KV blip drops the log line, not the operation.
  try {
    await kvListPushCapped(AUDIT_KEY, JSON.stringify(full), AUDIT_CAP);
  } catch (err) {
    console.warn("[admin-audit] write failed", err);
  }
}

export async function listAuditEntries(limit = 50): Promise<AdminAuditEntry[]> {
  const raw = await kvListRange(AUDIT_KEY, 0, Math.max(0, limit - 1));
  const out: AdminAuditEntry[] = [];
  for (const line of raw) {
    try {
      out.push(JSON.parse(line) as AdminAuditEntry);
    } catch {
      // skip a corrupt entry rather than fail the whole list
    }
  }
  return out;
}
