import { randomBytes } from "crypto";
import { kvGet, kvSAdd, kvSMembers, kvSet, kvSRem } from "@/lib/kv";

/* Invite-code pool.
   ─────────────────
   Step 0 of the invite-only registration flow. An operator pre-loads
   codes into the pool; the Telegram-auth route consumes them one-by-one
   on first-time registration. Consume is atomic so two concurrent
   claims with the same code cannot both win.

   KV schema:
     access:pool:reserved         SET of currently-available codes
     access:pool:used:<code>      STRING owner label, set the moment SREM wins
*/

const POOL_KEY = "access:pool:reserved";
const USED_PREFIX = "access:pool:used:";
const CODE_PATTERN = /^[A-Za-z0-9_-]+$/;
export const MAX_INVITE_CODE_LENGTH = 128;
const MAX_OWNER_LABEL_LENGTH = 256;

export class AccessPoolError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = "AccessPoolError";
    this.code = code;
  }
}

function usedKey(code: string): string {
  return `${USED_PREFIX}${code}`;
}

function assertValidCode(code: string): void {
  if (!code || code.length > MAX_INVITE_CODE_LENGTH || !CODE_PATTERN.test(code)) {
    throw new AccessPoolError("invalid_code");
  }
}

function assertValidOwnerLabel(owner: string): void {
  if (!owner || owner.length > MAX_OWNER_LABEL_LENGTH) {
    throw new AccessPoolError("invalid_owner_label");
  }
}

function normalizeCodes(codes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of codes) {
    if (typeof raw !== "string") {
      throw new AccessPoolError("invalid_code");
    }
    const trimmed = raw.trim();
    assertValidCode(trimmed);
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export async function addInviteCodes(
  codes: string[]
): Promise<{ added: number; skipped: number }> {
  if (!Array.isArray(codes) || codes.length === 0) {
    throw new AccessPoolError("empty_input");
  }

  const normalized = normalizeCodes(codes);
  const skippedFromInput = codes.length - normalized.length;
  let added = 0;
  let skipped = skippedFromInput;

  for (const code of normalized) {
    // A code that has been consumed is never returned to the pool.
    if (await kvGet(usedKey(code))) {
      skipped += 1;
      continue;
    }
    // SADD returns 1 only when the member was new; 0 means already present.
    const isNew = await kvSAdd(POOL_KEY, code);
    if (isNew === 1) {
      added += 1;
    } else {
      skipped += 1;
    }
  }

  return { added, skipped };
}

export async function consumeInviteCode(
  code: string,
  ownerLabel: string
): Promise<boolean> {
  const trimmed = typeof code === "string" ? code.trim() : "";
  assertValidCode(trimmed);
  assertValidOwnerLabel(ownerLabel);

  // SREM is atomic: only one concurrent caller gets 1, the rest get 0.
  // The winner is the only one allowed to write the used-marker.
  const removed = await kvSRem(POOL_KEY, trimmed);
  if (removed !== 1) return false;

  await kvSet(usedKey(trimmed), ownerLabel);
  return true;
}

export async function listAvailableCodes(): Promise<string[]> {
  return await kvSMembers(POOL_KEY);
}

export async function getCodeUsage(code: string): Promise<string | null> {
  const trimmed = typeof code === "string" ? code.trim() : "";
  if (!trimmed || !CODE_PATTERN.test(trimmed)) return null;
  return await kvGet(usedKey(trimmed));
}

// Alphabet without easily-confused glyphs (no 0/O, no 1/I/L) — codes are
// read aloud and re-typed, so legibility wins over information density.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// Auto-generates a fresh invite code and pushes it into the pool. Format
// is XXXX-XXXX (8 chars, 31^8 ≈ 10^12 keyspace) — enough entropy to make
// guessing infeasible during the seed window, while staying short enough
// to read off a screen. Used by the bot's /invite command.
//
// Collision check: SADD returns 0 if the code happens to already exist;
// we retry up to 5 times before giving up. With 10^12 keyspace and a
// pool under 10^4, the retry path is theoretical, not practical.
export async function generateInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const bytes = randomBytes(8);
    const chars: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      chars.push(CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]);
    }
    const code = `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
    if (await kvGet(usedKey(code))) continue; // never reuse a burned code
    const added = await kvSAdd(POOL_KEY, code);
    if (added === 1) return code;
  }
  throw new AccessPoolError("code_generation_failed");
}
