const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const EMAIL_TIMEOUT_MS = 5000;

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; skipped?: boolean; status?: number; error: string };

export async function sendTransactionalEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();

  if (!apiKey || !from) {
    return { ok: false, skipped: true, error: "email_not_configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);

  try {
    const res = await fetch(RESEND_EMAILS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => null)) as { id?: unknown; message?: unknown } | null;

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: typeof data?.message === "string" ? data.message : "resend_send_failed",
      };
    }

    return { ok: true, id: typeof data?.id === "string" ? data.id : null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "email_send_failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}
