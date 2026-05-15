import { cookies } from "next/headers";
import { randomBytes, scrypt, timingSafeEqual, createHmac } from "crypto";
import { promisify } from "util";
import { kvDel, kvGet, kvSet, KvNotConfiguredError } from "@/lib/kv";
import { isValidEmail } from "@/lib/validation";

const scryptAsync = promisify(scrypt);

export const SESSION_COOKIE = "prsloy_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const VERIFY_TTL_SECONDS = 60 * 60 * 24;

export type AuthUser = {
  id: string;
  email: string;
  passwordHash: string;
  emailVerified: boolean;
  accessStatus: "pending" | "active" | "blocked";
  vpnSlug: string | null;
  subscriptionUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicAuthUser = Omit<AuthUser, "passwordHash">;

export class AuthError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = "AuthError";
    this.code = code;
  }
}

function userKey(id: string) {
  return `auth:user:${id}`;
}

function emailKey(email: string) {
  return `auth:email:${email}`;
}

function sessionKey(sessionId: string) {
  return `auth:session:${sessionId}`;
}

function verifyKey(token: string) {
  return `auth:verify:${token}`;
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
  return raw ? (JSON.parse(raw) as AuthUser) : null;
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
    createdAt: now,
    updatedAt: now,
  };

  try {
    await saveUser(user);
  } catch (err) {
    await kvDel(emailKey(normalized));
    throw err;
  }

  return publicUser(user);
}

export async function loginUser(email: string, password: string) {
  const user = await getUserByEmail(email);
  if (!user) throw new AuthError("invalid_credentials");
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

export function isAuthSetupError(err: unknown) {
  return getAuthSetupErrorCode(err) !== null;
}

export function getAuthSetupErrorCode(err: unknown) {
  if (err instanceof KvNotConfiguredError) return "kv_not_configured";
  if (err instanceof AuthError && err.code === "auth_secret_not_configured") {
    return "auth_secret_not_configured";
  }
  return null;
}
