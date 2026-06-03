import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { randomBytes, scrypt, timingSafeEqual, createHmac } from "crypto";
import { promisify } from "util";
import {
  getIndexedIds,
  kvDel,
  kvGet,
  kvSAdd,
  kvSRem,
  kvSet,
  KvNotConfiguredError,
} from "@/lib/kv";
import { AccessPoolError, consumeInviteCode, getCodeUsage } from "@/lib/access-pool";
import { isValidEmail } from "@/lib/validation";

const scryptAsync = promisify(scrypt);

export const SESSION_COOKIE = "prsloy_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const VERIFY_TTL_SECONDS = 60 * 60 * 24;

export type AuthUser = {
  id: string;
  // Identity invariant: at least one of (email, telegramId) is non-null.
  // Email is null for users who registered via Telegram and have not
  // linked an email yet (linking ships in a later step).
  email: string | null;
  passwordHash: string | null;
  emailVerified: boolean;
  accessStatus: "pending" | "active" | "blocked";
  vpnSlug: string | null;
  subscriptionUrl: string | null;
  telegramId: string | null;
  telegramUsername: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicAuthUser = Omit<AuthUser, "passwordHash">;

// Operator-facing shape for the admin user list. Never exposes the
// password hash or the raw subscription URL — only whether one exists.
export type AdminUserSummary = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  accessStatus: AuthUser["accessStatus"];
  vpnSlug: string | null;
  hasSubscriptionUrl: boolean;
  telegramId: string | null;
  telegramUsername: string | null;
  createdAt: string;
  updatedAt: string;
};

export class AuthError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = "AuthError";
    this.code = code;
  }
}

function emailKey(email: string) {
  return `auth:email:${email}`;
}

function telegramKey(telegramId: string) {
  return `auth:telegram:${telegramId}`;
}

function sessionKey(sessionId: string) {
  return `auth:session:${sessionId}`;
}

function verifyKey(token: string) {
  return `auth:verify:${token}`;
}

const USERS_INDEX_KEY = "auth:users:index";
const USERS_INDEX_SYNCED_KEY = "auth:users:index:synced";
const USER_KEY_PREFIX = "auth:user:";

function userKey(id: string) {
  return `${USER_KEY_PREFIX}${id}`;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function publicUser(user: AuthUser): PublicAuthUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    accessStatus: user.accessStatus,
    vpnSlug: user.vpnSlug,
    subscriptionUrl: user.subscriptionUrl,
    telegramId: user.telegramId,
    telegramUsername: user.telegramUsername,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function adminUserSummary(user: AuthUser): AdminUserSummary {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    accessStatus: user.accessStatus,
    vpnSlug: user.vpnSlug,
    hasSubscriptionUrl: Boolean(user.subscriptionUrl),
    telegramId: user.telegramId,
    telegramUsername: user.telegramUsername,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new AuthError("auth_secret_not_configured");
  }
  return secret;
}

function signToken(raw: string): string {
  return createHmac("sha256", getAuthSecret()).update(raw).digest("hex");
}

function packSession(raw: string): string {
  return `${raw}.${signToken(raw)}`;
}

function unpackSession(value: string | undefined): string | null {
  if (!value) return null;
  const [raw, sig] = value.split(".");
  if (!raw || !sig) return null;
  const expected = signToken(raw);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return raw;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [algo, salt, expectedHex] = hash.split(":");
  if (algo !== "scrypt" || !salt || !expectedHex) return false;
  const actual = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function getUserById(id: string): Promise<AuthUser | null> {
  const raw = await kvGet(userKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch (err) {
    console.warn("[auth] corrupt user record skipped", id, err);
    return null;
  }
}

export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  const normalized = normalizeEmail(email);
  const id = await kvGet(emailKey(normalized));
  return id ? await getUserById(id) : null;
}

async function saveUser(user: AuthUser): Promise<void> {
  await kvSet(userKey(user.id), JSON.stringify(user));
}

export async function registerUser(email: string, password: string) {
  const normalized = normalizeEmail(email);

  if (!isValidEmail(normalized)) throw new AuthError("invalid_email");
  if (password.length < 8 || password.length > 128) {
    throw new AuthError("invalid_password");
  }

  const id = randomBytes(16).toString("hex");
  const now = new Date().toISOString();
  const reserved = await kvSet(emailKey(normalized), id, { nx: true });
  if (!reserved) throw new AuthError("email_exists");

  const user: AuthUser = {
    id,
    email: normalized,
    passwordHash: await hashPassword(password),
    emailVerified: false,
    accessStatus: "pending",
    vpnSlug: null,
    subscriptionUrl: null,
    telegramId: null,
    telegramUsername: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await saveUser(user);
  } catch (err) {
    await kvDel(emailKey(normalized));
    throw err;
  }

  // Best-effort: the account is already saved. A failed index write
  // only hides the user from the admin list, so it must not fail
  // registration.
  try {
    await kvSAdd(USERS_INDEX_KEY, id);
  } catch (err) {
    console.warn("[auth] failed to add user to index", err);
  }

  return publicUser(user);
}

// Email/password registration with invite-gate. Public sign-up path —
// users coming through /register are required to present a valid code,
// same as the Telegram-auth flow.
//
// Inverse-rollback order mirrors loginOrRegisterByTelegram:
//   1. NX-reserve email index
//   2. consume invite code
//   3. saveUser
// On failure of step 2 or 3 the email reservation is released. The
// invite code, once consumed, stays burned — the access-pool used-marker
// already points at this aborted user id so the operator can audit.
export async function registerUserWithInvite(
  email: string,
  password: string,
  inviteCode: string
) {
  const normalized = normalizeEmail(email);

  if (!isValidEmail(normalized)) throw new AuthError("invalid_email");
  if (password.length < 8 || password.length > 128) {
    throw new AuthError("invalid_password");
  }
  const trimmedCode = typeof inviteCode === "string" ? inviteCode.trim() : "";
  if (!trimmedCode) throw new AuthError("invite_required");

  const id = randomBytes(16).toString("hex");
  const now = new Date().toISOString();

  const reserved = await kvSet(emailKey(normalized), id, { nx: true });
  if (!reserved) throw new AuthError("email_exists");

  let consumed = false;
  try {
    try {
      consumed = await consumeInviteCode(trimmedCode, `user:${id}`);
    } catch (err) {
      if (err instanceof AccessPoolError && err.code === "invalid_code") {
        throw new AuthError("invite_invalid");
      }
      throw err;
    }
    if (!consumed) {
      const usedBy = await getCodeUsage(trimmedCode).catch(() => null);
      throw new AuthError(usedBy ? "invite_consumed" : "invite_invalid");
    }

    const user: AuthUser = {
      id,
      email: normalized,
      passwordHash: await hashPassword(password),
      emailVerified: false,
      accessStatus: "pending",
      vpnSlug: null,
      subscriptionUrl: null,
      telegramId: null,
      telegramUsername: null,
      createdAt: now,
      updatedAt: now,
    };

    await saveUser(user);

    try {
      await kvSAdd(USERS_INDEX_KEY, id);
    } catch (err) {
      console.warn("[auth] failed to add user to index", err);
    }

    return publicUser(user);
  } catch (err) {
    await kvDel(emailKey(normalized)).catch(() => undefined);
    if (consumed) {
      console.error(
        "[auth] saveUser failed after invite consume — invite burned",
        id,
        err
      );
    }
    throw err;
  }
}

export async function listUsers(): Promise<AdminUserSummary[]> {
  const ids = await getIndexedIds({
    indexKey: USERS_INDEX_KEY,
    keyPrefix: USER_KEY_PREFIX,
    syncFlagKey: USERS_INDEX_SYNCED_KEY,
    excludeKeys: [],
  });
  if (ids.length === 0) return [];

  const users = await Promise.all(ids.map((id) => getUserById(id)));
  return users
    .filter((user): user is AuthUser => user !== null)
    .map(adminUserSummary)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteUser(userId: string): Promise<AdminUserSummary> {
  const id = userId.trim();
  if (!id) throw new AuthError("not_found");

  const user = await getUserById(id);
  if (!user) throw new AuthError("not_found");

  const ops: Promise<unknown>[] = [
    kvDel(userKey(user.id)),
    kvSRem(USERS_INDEX_KEY, user.id),
  ];
  if (user.email) ops.push(kvDel(emailKey(user.email)));
  if (user.telegramId) ops.push(kvDel(telegramKey(user.telegramId)));
  await Promise.all(ops);

  return adminUserSummary(user);
}

export async function loginUser(email: string, password: string) {
  const user = await getUserByEmail(email);
  if (!user || !user.passwordHash) throw new AuthError("invalid_credentials");
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new AuthError("invalid_credentials");
  return publicUser(user);
}

export async function createSession(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  await kvSet(sessionKey(raw), userId, { ex: SESSION_TTL_SECONDS });
  return packSession(raw);
}

export async function destroySession(cookieValue: string | undefined) {
  const raw = unpackSession(cookieValue);
  if (raw) await kvDel(sessionKey(raw));
}

export async function getCurrentUser(): Promise<PublicAuthUser | null> {
  const cookieStore = await cookies();
  const raw = unpackSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!raw) return null;
  const userId = await kvGet(sessionKey(raw));
  if (!userId) return null;
  const user = await getUserById(userId);
  return user ? publicUser(user) : null;
}

export async function issueVerificationToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await kvSet(verifyKey(token), userId, { ex: VERIFY_TTL_SECONDS });
  return token;
}

export async function verifyEmailToken(token: string): Promise<PublicAuthUser> {
  const userId = await kvGet(verifyKey(token));
  if (!userId) throw new AuthError("invalid_token");
  const user = await getUserById(userId);
  if (!user) throw new AuthError("invalid_token");

  user.emailVerified = true;
  user.updatedAt = new Date().toISOString();
  await saveUser(user);
  await kvDel(verifyKey(token));

  return publicUser(user);
}

export async function createVerificationTokenForEmail(email: string): Promise<{
  user: PublicAuthUser;
  token: string;
}> {
  const user = await getUserByEmail(email);
  if (!user) throw new AuthError("not_found");
  const token = await issueVerificationToken(user.id);
  return { user: publicUser(user), token };
}

export async function getUserByTelegramId(
  telegramId: string
): Promise<AuthUser | null> {
  const id = await kvGet(telegramKey(telegramId));
  return id ? await getUserById(id) : null;
}

// Identifier may be: an email, "@username" (Telegram), or a numeric
// Telegram id. Used by /admin/grant so operators can find a user whether
// they registered via email or Telegram.
async function resolveUserByIdentifier(raw: string): Promise<AuthUser | null> {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    return await getUserByTelegramId(trimmed);
  }

  if (trimmed.startsWith("@")) {
    const username = trimmed.slice(1).toLowerCase();
    if (!username) return null;
    // Telegram usernames are not indexed separately. With invite-only
    // beta volume an O(N) walk through the users index is acceptable;
    // a dedicated index can come if /admin gets a real search.
    const ids = await getIndexedIds({
      indexKey: USERS_INDEX_KEY,
      keyPrefix: USER_KEY_PREFIX,
      syncFlagKey: USERS_INDEX_SYNCED_KEY,
      excludeKeys: [USERS_INDEX_KEY, USERS_INDEX_SYNCED_KEY],
    });
    for (const id of ids) {
      const candidate = await getUserById(id);
      if (candidate?.telegramUsername?.toLowerCase() === username) {
        return candidate;
      }
    }
    return null;
  }

  return await getUserByEmail(trimmed);
}

export async function grantAccess(
  identifier: string,
  opts: { subscriptionUrl?: string } = {}
): Promise<PublicAuthUser> {
  const user = await resolveUserByIdentifier(identifier);
  if (!user) throw new AuthError("not_found");

  // Blocking is a deliberate moderation action. A grant must not silently
  // re-activate a blocked account — the operator has to unblock first.
  if (user.accessStatus === "blocked") {
    throw new AuthError("user_blocked");
  }

  const subscriptionUrl = opts.subscriptionUrl?.trim() || user.subscriptionUrl;
  if (!subscriptionUrl) throw new AuthError("subscription_url_required");

  const slug = user.vpnSlug ?? randomBytes(8).toString("hex");
  user.accessStatus = "active";
  user.vpnSlug = slug;
  user.subscriptionUrl = subscriptionUrl;
  user.updatedAt = new Date().toISOString();
  await saveUser(user);

  return publicUser(user);
}

// Payment-flow variant of grantAccess: looks up the user by internal id
// (orders carry userId, not the human identifier) and respects the same
// blocked-account guard. Throws on blocked so the caller in payments.ts
// can log the anomaly without rolling back the payment.
export async function grantSubscriptionByUserId(
  userId: string,
  subscriptionUrl: string
): Promise<PublicAuthUser> {
  const user = await getUserById(userId);
  if (!user) throw new AuthError("not_found");
  if (user.accessStatus === "blocked") {
    throw new AuthError("user_blocked");
  }
  const trimmed = subscriptionUrl.trim();
  if (!trimmed) throw new AuthError("subscription_url_required");

  user.accessStatus = "active";
  user.vpnSlug = user.vpnSlug ?? randomBytes(8).toString("hex");
  user.subscriptionUrl = trimmed;
  user.updatedAt = new Date().toISOString();
  await saveUser(user);
  return publicUser(user);
}

// First-time Telegram registration consumes an invite code. Returning
// Telegram users (telegramId already known) just get a session with the
// username synced from the latest payload.
//
// Ordering follows the inverse-rollback pattern from the plan review:
//   1. NX-reserve auth:telegram:<id>
//   2. consumeInviteCode (atomic SREM in the pool)
//   3. saveUser
// On failure of (2) or (3) we undo (1). The invite code itself, once
// consumed, stays burned — the used-marker in access:pool already points
// at this aborted user id, so the operator can audit the orphan.
export async function loginOrRegisterByTelegram(params: {
  telegramId: string;
  telegramUsername: string | null;
  inviteCode?: string;
}): Promise<{ user: PublicAuthUser; isNew: boolean }> {
  const { telegramId, telegramUsername, inviteCode } = params;

  const existing = await getUserByTelegramId(telegramId);
  if (existing) {
    if (existing.telegramUsername !== telegramUsername) {
      existing.telegramUsername = telegramUsername;
      existing.updatedAt = new Date().toISOString();
      await saveUser(existing);
    }
    return { user: publicUser(existing), isNew: false };
  }

  if (!inviteCode) throw new AuthError("invite_required");

  const id = randomBytes(16).toString("hex");
  const now = new Date().toISOString();

  const reserved = await kvSet(telegramKey(telegramId), id, { nx: true });
  if (!reserved) throw new AuthError("telegram_id_taken");

  let consumed = false;
  try {
    try {
      consumed = await consumeInviteCode(inviteCode, `user:${id}`);
    } catch (err) {
      // AccessPoolError("invalid_code") happens on malformed input —
      // translate so the route surfaces a clean error code to the user.
      if (err instanceof AccessPoolError && err.code === "invalid_code") {
        throw new AuthError("invite_invalid");
      }
      throw err;
    }
    if (!consumed) {
      // Distinguish "code exists but already burned" from "code never
      // existed (typo / not in pool)" — the UI shows a different message
      // for each. The extra read only fires on the error path.
      const usedBy = await getCodeUsage(inviteCode).catch(() => null);
      throw new AuthError(usedBy ? "invite_consumed" : "invite_invalid");
    }

    const user: AuthUser = {
      id,
      email: null,
      passwordHash: null,
      emailVerified: false,
      accessStatus: "pending",
      vpnSlug: null,
      subscriptionUrl: null,
      telegramId,
      telegramUsername,
      createdAt: now,
      updatedAt: now,
    };

    await saveUser(user);

    try {
      await kvSAdd(USERS_INDEX_KEY, id);
    } catch (err) {
      console.warn("[auth] failed to add Telegram user to index", err);
    }

    return { user: publicUser(user), isNew: true };
  } catch (err) {
    try {
      await kvDel(telegramKey(telegramId));
    } catch (cleanupErr) {
      // Rollback failed: the telegram→user reservation is stuck. Future
      // NX-reserve calls for this telegram_id will return null and the
      // user will see "telegram_id_taken" with no real owner. Surface
      // loudly so an operator can DEL the key manually.
      console.error(
        "[auth] failed to roll back telegram reservation — operator must DEL the key",
        telegramKey(telegramId),
        cleanupErr
      );
    }
    if (consumed) {
      console.error(
        "[auth] saveUser failed after invite consume — invite burned",
        id,
        err
      );
    }
    throw err;
  }
}

export function setSessionCookie(res: NextResponse, session: string): void {
  res.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function isAuthSetupError(err: unknown) {
  return getAuthSetupErrorCode(err) !== null;
}

export function getAuthSetupErrorCode(err: unknown) {
  if (err instanceof KvNotConfiguredError) return "kv_not_configured";
  if (err instanceof AuthError && err.code === "auth_secret_not_configured") {
    return "auth_secret_not_configured";
  }
  if (err instanceof AuthError && err.code === "telegram_not_configured") {
    return "telegram_not_configured";
  }
  return null;
}
