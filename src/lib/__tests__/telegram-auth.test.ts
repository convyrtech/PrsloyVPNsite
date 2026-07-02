import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installFakeRedis } from "./fake-redis";
import {
  buildDeepLink,
  confirmNonce,
  getNonceState,
  isTelegramConfigured,
  mintNonce,
  parseStartCommand,
  tryClaimNonce,
  validateWebhookSecret,
} from "@/lib/telegram-auth";

const redis = installFakeRedis();

const SAVED_ENV = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
};

beforeEach(() => {
  redis.reset();
  process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
  process.env.TELEGRAM_BOT_USERNAME = "prsloy_dev_bot";
  process.env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret-with-enough-bytes";
});

afterEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = SAVED_ENV.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_USERNAME = SAVED_ENV.TELEGRAM_BOT_USERNAME;
  process.env.TELEGRAM_WEBHOOK_SECRET = SAVED_ENV.TELEGRAM_WEBHOOK_SECRET;
});

describe("isTelegramConfigured", () => {
  it("returns true when all three env vars are set", () => {
    expect(isTelegramConfigured()).toBe(true);
  });

  it("returns false when any required env var is missing", () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(isTelegramConfigured()).toBe(false);
    process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
    delete process.env.TELEGRAM_BOT_USERNAME;
    expect(isTelegramConfigured()).toBe(false);
    process.env.TELEGRAM_BOT_USERNAME = "prsloy_dev_bot";
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    expect(isTelegramConfigured()).toBe(false);
  });

  it("returns false when the webhook secret is shorter than the floor", () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "too-short";
    expect(isTelegramConfigured()).toBe(false);
  });
});

describe("validateWebhookSecret", () => {
  it("accepts the request with the matching secret header", () => {
    const req = new Request("http://test.local", {
      headers: {
        "x-telegram-bot-api-secret-token":
          "test-webhook-secret-with-enough-bytes",
      },
    });
    expect(validateWebhookSecret(req)).toBe(true);
  });

  it("rejects requests with the wrong secret", () => {
    const req = new Request("http://test.local", {
      headers: { "x-telegram-bot-api-secret-token": "wrong-secret" },
    });
    expect(validateWebhookSecret(req)).toBe(false);
  });

  it("rejects requests with no secret header at all", () => {
    const req = new Request("http://test.local");
    expect(validateWebhookSecret(req)).toBe(false);
  });

  it("rejects when the secret env var is not configured", () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const req = new Request("http://test.local", {
      headers: { "x-telegram-bot-api-secret-token": "anything" },
    });
    expect(validateWebhookSecret(req)).toBe(false);
  });
});

describe("parseStartCommand", () => {
  function buildUpdate(text: string, from: object | null = { id: 42, username: "alice" }) {
    return {
      update_id: 100,
      message: { text, from, chat: { id: 42, type: "private" } },
    };
  }

  it("parses the nonce from a /start command", () => {
    const parsed = parseStartCommand(buildUpdate("/start abc123-def"));
    expect(parsed).toEqual({
      updateId: 100,
      nonce: "abc123-def",
      telegramId: "42",
      telegramUsername: "alice",
    });
  });

  it("handles /start@botname suffix used in group chats", () => {
    const parsed = parseStartCommand(
      buildUpdate("/start@prsloy_dev_bot abc123")
    );
    expect(parsed?.nonce).toBe("abc123");
  });

  it("falls back to null username when Telegram does not provide one", () => {
    const parsed = parseStartCommand(
      buildUpdate("/start abc123", { id: 42 })
    );
    expect(parsed?.telegramUsername).toBeNull();
  });

  it("returns null for /start without an argument", () => {
    expect(parseStartCommand(buildUpdate("/start"))).toBeNull();
  });

  it("returns null when the nonce contains invalid characters", () => {
    expect(parseStartCommand(buildUpdate("/start has space"))).toBeNull();
    expect(parseStartCommand(buildUpdate("/start with/slash"))).toBeNull();
  });

  it("returns null for non-message updates (callback queries etc.)", () => {
    expect(parseStartCommand({ update_id: 1, callback_query: {} })).toBeNull();
  });

  it("returns null when the from-id is missing", () => {
    const parsed = parseStartCommand(buildUpdate("/start abc", null));
    expect(parsed).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(parseStartCommand(null)).toBeNull();
    expect(parseStartCommand("string")).toBeNull();
    expect(parseStartCommand(42)).toBeNull();
  });
});

describe("parseBotMessage", () => {
  function buildUpdate(text: string, from: object | null = { id: 42, username: "alice" }) {
    return {
      update_id: 100,
      message: { text, from, chat: { id: 42, type: "private" } },
    };
  }

  it("recognises /start with nonce as start_with_nonce", async () => {
    const { parseBotMessage } = await import("@/lib/telegram-auth");
    const parsed = parseBotMessage(buildUpdate("/start abc123-def"));
    expect(parsed).toMatchObject({
      kind: "start_with_nonce",
      nonce: "abc123-def",
      telegramId: "42",
      chatId: "42",
    });
  });

  it("recognises plain /start as start_plain", async () => {
    const { parseBotMessage } = await import("@/lib/telegram-auth");
    const parsed = parseBotMessage(buildUpdate("/start"));
    expect(parsed).toMatchObject({
      kind: "start_plain",
      telegramId: "42",
      chatId: "42",
    });
  });

  it("recognises /start@botname (group chat suffix) without nonce", async () => {
    const { parseBotMessage } = await import("@/lib/telegram-auth");
    const parsed = parseBotMessage(buildUpdate("/start@prsloy_dev_bot"));
    expect(parsed?.kind).toBe("start_plain");
  });

  it("returns null for unknown commands", async () => {
    const { parseBotMessage } = await import("@/lib/telegram-auth");
    expect(parseBotMessage(buildUpdate("/help"))).toBeNull();
    expect(parseBotMessage(buildUpdate("random text"))).toBeNull();
  });

  it("uses chat.id when distinct from from.id (e.g. group chats)", async () => {
    const { parseBotMessage } = await import("@/lib/telegram-auth");
    const update = {
      update_id: 100,
      message: {
        text: "/start",
        from: { id: 42, username: "alice" },
        chat: { id: -100200300, type: "supergroup" },
      },
    };
    const parsed = parseBotMessage(update);
    expect(parsed?.chatId).toBe("-100200300");
    expect(parsed?.telegramId).toBe("42");
  });

  it("falls back to from.id as chatId when chat is missing", async () => {
    const { parseBotMessage } = await import("@/lib/telegram-auth");
    const update = {
      update_id: 100,
      message: { text: "/start", from: { id: 42 } },
    };
    const parsed = parseBotMessage(update);
    expect(parsed?.chatId).toBe("42");
  });

  it("parses a confirm callback_query as confirm_login", async () => {
    const { parseBotMessage } = await import("@/lib/telegram-auth");
    const parsed = parseBotMessage({
      update_id: 200,
      callback_query: {
        id: "cbq-9",
        from: { id: 42, username: "alice" },
        message: { chat: { id: 42 } },
        data: "tgauth:confirm:abc123-def",
      },
    });
    expect(parsed).toMatchObject({
      kind: "confirm_login",
      nonce: "abc123-def",
      telegramId: "42",
      chatId: "42",
      callbackQueryId: "cbq-9",
    });
  });

  it("parses a deny callback_query as deny_login", async () => {
    const { parseBotMessage } = await import("@/lib/telegram-auth");
    const parsed = parseBotMessage({
      update_id: 201,
      callback_query: {
        id: "cbq-10",
        from: { id: 42 },
        message: { chat: { id: 42 } },
        data: "tgauth:deny:abc123",
      },
    });
    expect(parsed?.kind).toBe("deny_login");
  });

  it("returns null for a callback_query with unrecognised data", async () => {
    const { parseBotMessage } = await import("@/lib/telegram-auth");
    expect(
      parseBotMessage({
        update_id: 202,
        callback_query: { id: "x", from: { id: 42 }, data: "other:thing" },
      })
    ).toBeNull();
  });

  it("returns null for a confirm callback with a malformed nonce", async () => {
    const { parseBotMessage } = await import("@/lib/telegram-auth");
    expect(
      parseBotMessage({
        update_id: 203,
        callback_query: {
          id: "x",
          from: { id: 42 },
          data: "tgauth:confirm:has space",
        },
      })
    ).toBeNull();
  });
});

describe("nonce lifecycle", () => {
  it("mint → state is pending → claim returns pending", async () => {
    const nonce = await mintNonce();
    const state = await getNonceState(nonce);
    expect(state?.status).toBe("pending");
    const claim = await tryClaimNonce(nonce);
    expect(claim.status).toBe("pending");
  });

  it("confirm a pending nonce, then claim returns ready with payload", async () => {
    const nonce = await mintNonce();
    await confirmNonce(nonce, "555", "alice");
    const claim = await tryClaimNonce(nonce);
    expect(claim).toMatchObject({
      status: "ready",
      telegramId: "555",
      telegramUsername: "alice",
    });
  });

  it("confirm preserves a null telegramUsername", async () => {
    const nonce = await mintNonce();
    await confirmNonce(nonce, "555", null);
    const claim = await tryClaimNonce(nonce);
    if (claim.status !== "ready") throw new Error("expected ready");
    expect(claim.telegramUsername).toBeNull();
  });

  it("two claims of the same confirmed nonce: exactly one wins", async () => {
    const nonce = await mintNonce();
    await confirmNonce(nonce, "555", "alice");

    const [a, b] = await Promise.all([
      tryClaimNonce(nonce),
      tryClaimNonce(nonce),
    ]);

    const readyCount = [a, b].filter((c) => c.status === "ready").length;
    const consumedCount = [a, b].filter((c) => c.status === "consumed").length;
    expect(readyCount).toBe(1);
    expect(consumedCount).toBe(1);
  });

  it("claim returns expired for a nonce that was never minted", async () => {
    const claim = await tryClaimNonce("never-existed");
    expect(claim.status).toBe("expired");
  });

  it("confirm is a no-op on a nonce that is not pending (late webhook retry)", async () => {
    const nonce = await mintNonce();
    await confirmNonce(nonce, "555", "alice");
    await tryClaimNonce(nonce); // status moves to consumed via claimed marker
    // A late retry must not be able to rewrite the captured payload.
    await confirmNonce(nonce, "999", "evil");
    const state = await getNonceState(nonce);
    if (state?.status !== "confirmed") throw new Error("expected confirmed");
    expect(state.telegramId).toBe("555");
  });

  it("two concurrent confirmNonces with different identities: first wins", async () => {
    const nonce = await mintNonce();

    await Promise.all([
      confirmNonce(nonce, "victim", "victim_user"),
      confirmNonce(nonce, "attacker", "attacker_user"),
    ]);

    // NX-write means exactly one of the two payloads landed. We can't
    // know which raced first in a fake store, but the captured identity
    // must equal one of them and the second confirmNonce must not have
    // overwritten the first.
    const state = await getNonceState(nonce);
    if (state?.status !== "confirmed") throw new Error("expected confirmed");
    expect(["victim", "attacker"]).toContain(state.telegramId);

    // A subsequent confirm from yet a third id must also be a no-op.
    await confirmNonce(nonce, "third", "third_user");
    const afterThird = await getNonceState(nonce);
    if (afterThird?.status !== "confirmed") throw new Error("expected confirmed");
    expect(afterThird.telegramId).toBe(state.telegramId);
  });
});

describe("buildDeepLink", () => {
  it("builds a t.me link to the configured bot with the nonce as start parameter", () => {
    expect(buildDeepLink("abc123")).toBe(
      "https://t.me/prsloy_dev_bot?start=abc123"
    );
  });

  it("strips a leading @ from TELEGRAM_BOT_USERNAME", () => {
    process.env.TELEGRAM_BOT_USERNAME = "@prsloy_dev_bot";
    expect(buildDeepLink("xyz")).toBe(
      "https://t.me/prsloy_dev_bot?start=xyz"
    );
  });

  it("url-encodes problematic characters in the nonce", () => {
    // Real nonces are hex so this only matters defensively, but the encoder
    // should not double-encode a clean hex string.
    expect(buildDeepLink("abcDEF123")).toBe(
      "https://t.me/prsloy_dev_bot?start=abcDEF123"
    );
  });
});
