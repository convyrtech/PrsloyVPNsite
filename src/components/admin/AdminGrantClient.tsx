"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/routing";
import {
  clearStoredAdminSecret,
  getStoredAdminSecret,
  storeAdminSecret,
} from "@/lib/admin-secret-storage";

type GrantUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  accessStatus: string;
  vpnSlug: string | null;
  subscriptionUrl: string | null;
  updatedAt: string;
};

type GrantResult =
  | { kind: "idle" }
  | { kind: "success"; user: GrantUser }
  | { kind: "error"; message: string };

type AdminGrantCopy = {
  navUsers: string;
  navGrant: string;
  backToUsers: string;
  title: string;
  subtitle: string;
  operator: string;
  grant: string;
  steps: string[];
  inputTitle: string;
  emailLabel: string;
  configLabel: string;
  granting: string;
  grantAccess: string;
  previewTitle: string;
  previewEmail: string;
  previewConfig: string;
  previewResult: string;
  waiting: string;
  readyToIssue: string;
  previewBody: string;
  successAccess: string;
  successVerified: string;
  successUpdated: string;
  successConfigLabel: string;
  successShow: string;
  successHide: string;
  successCopy: string;
  successCopied: string;
  successCopyError: string;
  verifiedYes: string;
  verifiedPending: string;
  openDashboard: string;
  notes: Array<{ title: string; body: string }>;
  errors: Record<string, string>;
};

const COPY: Record<"ru" | "en", AdminGrantCopy> = {
  ru: {
    navUsers: "Пользователи",
    navGrant: "Выдать доступ",
    backToUsers: "К списку пользователей",
    title: "Выдать доступ.",
    subtitle:
      "Привязать реальную subscription/config ссылку к существующему PRSLOY ID. Оплата здесь не создается: это ручная выдача beta-доступа.",
    operator: "Оператор",
    grant: "Выдача",
    steps: ["Найти", "Привязать", "Проверить"],
    inputTitle: "Данные выдачи",
    emailLabel: "Email аккаунта",
    configLabel: "VPN subscription/config URL",
    granting: "Выдаем...",
    grantAccess: "Выдать доступ",
    previewTitle: "Проверка",
    previewEmail: "Email",
    previewConfig: "Конфиг",
    previewResult: "Результат",
    waiting: "ожидает",
    readyToIssue: "готово к выдаче",
    previewBody:
      "Предпросмотр не вызывает API. Статус доступа изменится только после успешной выдачи.",
    successAccess: "Доступ",
    successVerified: "Почта",
    successUpdated: "Обновлено",
    successConfigLabel: "Выданный конфиг",
    successShow: "Показать",
    successHide: "Скрыть",
    successCopy: "Скопировать",
    successCopied: "Скопировано",
    successCopyError: "Не получилось скопировать. Выдели вручную.",
    verifiedYes: "подтверждена",
    verifiedPending: "ждет подтверждения",
    openDashboard: "Открыть ЛК для проверки",
    notes: [
      {
        title: "Аккаунт уже должен быть",
        body: "Пользователь сначала создает PRSLOY ID. Эта форма не регистрирует аккаунты.",
      },
      {
        title: "Только реальный конфиг",
        body: "Вставляй фактическую ссылку из панели провайдера. Неверные URL будут отклонены.",
      },
      {
        title: "Пользователь обновляет ЛК",
        body: "После успешной выдачи пользователь обновляет кабинет и сразу видит активный доступ.",
      },
    ],
    errors: {
      unauthorized: "Неверный ADMIN_SECRET.",
      not_found: "Админ endpoint отключен. Добавь ADMIN_SECRET в Vercel env.",
      user_not_found: "Аккаунта с таким email нет.",
      user_blocked: "Аккаунт заблокирован. Сначала сними блокировку, потом выдавай ключ.",
      email_required: "Нужен email.",
      invalid_email: "Email выглядит неверно.",
      subscription_url_required: "Нужна subscription/config ссылка.",
      invalid_subscription_url: "Нужен поддерживаемый subscription URL или config URI.",
      kv_not_configured: "Хранилище аккаунтов не настроено.",
      auth_secret_not_configured: "AUTH_SECRET не настроен.",
      invalid_json: "Неверное тело запроса.",
      grant_failed: "Выдача не прошла. Проверь server logs.",
      unknown: "Неизвестная ошибка админки.",
      network: "Ошибка сети.",
    },
  },
  en: {
    navUsers: "Users",
    navGrant: "Grant access",
    backToUsers: "Back to users",
    title: "Issue access.",
    subtitle:
      "Attach a real VPN subscription/config URL to an existing PRSLOY ID. No payment state is created here; this is manual beta issuing.",
    operator: "Operator",
    grant: "Grant",
    steps: ["Find", "Attach", "Verify"],
    inputTitle: "Access input",
    emailLabel: "Account email",
    configLabel: "VPN subscription/config URL",
    granting: "Granting...",
    grantAccess: "Grant access",
    previewTitle: "Grant preview",
    previewEmail: "Email",
    previewConfig: "Config",
    previewResult: "Result",
    waiting: "waiting",
    readyToIssue: "ready to issue",
    previewBody:
      "This preview does not call the API. The access state changes only after the grant request returns success.",
    successAccess: "Access",
    successVerified: "Verified",
    successUpdated: "Updated",
    successConfigLabel: "Issued config",
    successShow: "Show",
    successHide: "Hide",
    successCopy: "Copy",
    successCopied: "Copied",
    successCopyError: "Could not copy. Select the URL manually.",
    verifiedYes: "yes",
    verifiedPending: "pending email",
    openDashboard: "Open dashboard check",
    notes: [
      {
        title: "Existing account",
        body: "The user must create a PRSLOY ID first. This tool does not register accounts.",
      },
      {
        title: "Real config only",
        body: "Paste the actual subscription/config URL from the provisioning panel. Bad URLs are rejected.",
      },
      {
        title: "User reloads dashboard",
        body: "After success, the user can refresh the dashboard and see active access immediately.",
      },
    ],
    errors: {
      unauthorized: "Wrong ADMIN_SECRET.",
      not_found: "Admin endpoint is disabled. Add ADMIN_SECRET in Vercel env.",
      user_not_found: "No account exists for this email.",
      user_blocked: "The account is blocked. Unblock it before issuing a key.",
      email_required: "Email is required.",
      invalid_email: "Email looks invalid.",
      subscription_url_required: "Subscription/config URL is required.",
      invalid_subscription_url: "Use a supported subscription URL or config URI.",
      kv_not_configured: "Account storage is not configured.",
      auth_secret_not_configured: "AUTH_SECRET is not configured.",
      invalid_json: "Invalid request body.",
      grant_failed: "Grant failed. Check server logs.",
      unknown: "Unknown admin error.",
      network: "Network error.",
    },
  },
};

export function AdminGrantClient({ locale }: { locale: string }) {
  const copy = getCopy(locale);
  const searchParams = useSearchParams();
  const [secret, setSecret] = useState("");
  const [email, setEmail] = useState(() =>
    (searchParams.get("email") ?? "").trim().toLowerCase()
  );
  const [subscriptionUrl, setSubscriptionUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<GrantResult>({ kind: "idle" });

  // Prefill from sessionStorage after hydration so server and client render
  // the same empty input on first paint.
  useEffect(() => {
    const stored = getStoredAdminSecret();
    if (stored) setSecret(stored);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

    const trimmedSecret = secret.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUrl = subscriptionUrl.trim();
    const localError = validateGrantInput(normalizedEmail, normalizedUrl, copy);
    if (localError) {
      setResult({ kind: "error", message: localError });
      return;
    }

    setPending(true);
    setResult({ kind: "idle" });

    try {
      const res = await fetch("/api/admin/grant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${trimmedSecret}`,
        },
        body: JSON.stringify({
          email: normalizedEmail,
          subscriptionUrl: normalizedUrl,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        user?: GrantUser;
        error?: string;
      };

      if (!res.ok || !data.ok || !data.user) {
        if (res.status === 401) clearStoredAdminSecret();
        setResult({
          kind: "error",
          message: copy.errors[data.error || ""] || copy.errors.unknown,
        });
        return;
      }

      storeAdminSecret(trimmedSecret);
      setResult({ kind: "success", user: data.user });
      // Clear the per-grant inputs but keep the secret so the operator
      // can move on to the next user without retyping.
      setEmail("");
      setSubscriptionUrl("");
    } catch {
      setResult({ kind: "error", message: copy.errors.network });
    } finally {
      setPending(false);
    }
  }

  const hasPreview = email.trim() || subscriptionUrl.trim();

  return (
    <main className="min-h-screen bg-black text-text-primary pt-[120px] pb-3xl">
      <div className="max-w-6xl mx-auto px-lg flex flex-col gap-2xl">
        <AdminNav copy={copy} active="grant" />

        <header className="grid gap-xl lg:grid-cols-[1fr_320px] lg:items-end">
          <div className="flex flex-col gap-md">
            <p className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
              PRSLOY ADMIN
            </p>
            <h1
              className="font-body font-bold text-text-display leading-[0.98]"
              style={{ fontSize: "clamp(40px, 7vw, 84px)" }}
            >
              {copy.title}
            </h1>
            <p className="max-w-2xl font-body text-body text-text-secondary leading-[1.65]">
              {copy.subtitle}
            </p>
          </div>

          <section className="border border-border-visible rounded-[8px] bg-surface p-lg flex flex-col gap-md">
            <div className="flex items-center justify-between gap-md font-mono text-label uppercase tracking-[0.14em]">
              <span className="text-text-disabled">{copy.operator}</span>
              <span className="text-text-display">{copy.grant}</span>
            </div>
            <div className="grid grid-cols-3 gap-sm">
              {copy.steps.map((item, index) => (
                <div key={item} className="border border-border-visible bg-black p-sm">
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-disabled">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="mt-xs font-mono text-label uppercase tracking-[0.08em] text-text-display">
                    {item}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-[1fr_0.86fr] gap-md">
          <form
            onSubmit={onSubmit}
            className="border border-border-visible rounded-[8px] p-xl sm:p-2xl bg-surface flex flex-col gap-lg"
          >
            <div className="flex items-center gap-md border-b border-border-visible pb-lg">
              <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
                {copy.inputTitle}
              </span>
              <span className="h-px flex-1 bg-border-visible/40" />
            </div>

            <AdminInput
              label="ADMIN_SECRET"
              type="password"
              value={secret}
              onChange={setSecret}
              autoComplete="off"
            />
            <AdminInput
              label={copy.emailLabel}
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
            />
            <AdminInput
              label={copy.configLabel}
              type="text"
              value={subscriptionUrl}
              onChange={setSubscriptionUrl}
              autoComplete="off"
            />

            <button
              type="submit"
              disabled={pending}
              className="mt-sm bg-text-display text-black font-mono uppercase tracking-[0.08em]
                         px-xl min-h-[48px] inline-flex items-center justify-center rounded-full text-label
                         hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait
                         transition duration-150 ease-out-nothing"
            >
              [ {pending ? copy.granting : copy.grantAccess} ]
            </button>

            {result.kind === "error" && (
              <p role="alert" className="font-body text-body-sm text-accent leading-[1.55]">
                {result.message}
              </p>
            )}
          </form>

          <aside className="border border-border-visible rounded-[8px] bg-black p-xl sm:p-2xl flex flex-col gap-xl">
            <div className="flex items-center justify-between gap-md">
              <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
                {copy.previewTitle}
              </span>
              <span
                className={`inline-block h-3 w-3 rounded-full ${
                  result.kind === "success"
                    ? "bg-success shadow-[0_0_14px_rgba(74,158,92,0.8)]"
                    : "bg-warning animate-pulse"
                }`}
              />
            </div>

            {result.kind === "success" ? (
              <SuccessPanel user={result.user} locale={locale} copy={copy} />
            ) : (
              <PreviewPanel
                email={email}
                subscriptionUrl={subscriptionUrl}
                hasPreview={Boolean(hasPreview)}
                copy={copy}
              />
            )}
          </aside>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-md">
          {copy.notes.map((note, index) => (
            <AdminNote
              key={note.title}
              index={String(index + 1).padStart(2, "0")}
              title={note.title}
              body={note.body}
            />
          ))}
        </section>
      </div>
    </main>
  );
}

function AdminNav({
  copy,
  active,
}: {
  copy: AdminGrantCopy;
  active: "users" | "grant";
}) {
  return (
    <nav className="flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between">
      <Link
        href="/admin/users"
        className="font-mono text-label uppercase tracking-[0.08em] text-text-display hover:opacity-80"
      >
        {copy.backToUsers} {"\u2190"}
      </Link>
      <div className="flex gap-sm font-mono text-label uppercase tracking-[0.08em]">
        <Link
          href="/admin/users"
          className={`border px-md py-sm transition-colors ${
            active === "users"
              ? "border-text-display text-text-display"
              : "border-border-visible text-text-secondary hover:border-text-display"
          }`}
        >
          {copy.navUsers}
        </Link>
        <Link
          href="/admin/grant"
          className={`border px-md py-sm transition-colors ${
            active === "grant"
              ? "border-text-display text-text-display"
              : "border-border-visible text-text-secondary hover:border-text-display"
          }`}
        >
          {copy.navGrant}
        </Link>
      </div>
    </nav>
  );
}

function PreviewPanel({
  email,
  subscriptionUrl,
  hasPreview,
  copy,
}: {
  email: string;
  subscriptionUrl: string;
  hasPreview: boolean;
  copy: AdminGrantCopy;
}) {
  const trimmedUrl = subscriptionUrl.trim();
  return (
    <div className="flex flex-col gap-lg">
      <div
        className="font-display font-bold text-text-display leading-[0.85]"
        style={{ fontSize: "clamp(64px, 10vw, 112px)", letterSpacing: "0.02em" }}
      >
        {hasPreview ? "01" : "00"}
      </div>
      <div className="flex flex-col">
        <PreviewRow label={copy.previewEmail} value={email.trim().toLowerCase() || copy.waiting} />
        <PreviewRow label={copy.previewConfig} value={trimmedUrl ? maskUrl(trimmedUrl) : copy.waiting} />
        <PreviewRow label={copy.previewResult} value={copy.readyToIssue} />
      </div>
      <p className="font-body text-body-sm text-text-secondary leading-[1.65]">
        {copy.previewBody}
      </p>
    </div>
  );
}

function SuccessPanel({
  user,
  locale,
  copy,
}: {
  user: GrantUser;
  locale: string;
  copy: AdminGrantCopy;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  async function copyUrl() {
    if (!user.subscriptionUrl) return;
    try {
      await navigator.clipboard.writeText(user.subscriptionUrl);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div className="flex flex-col gap-lg">
      <div
        className="font-display font-bold text-text-display leading-[0.85]"
        style={{ fontSize: "clamp(64px, 10vw, 112px)", letterSpacing: "0.02em" }}
      >
        OK
      </div>
      <div className="flex flex-col">
        <PreviewRow label={copy.previewEmail} value={user.email} />
        <PreviewRow label={copy.successAccess} value={user.accessStatus} />
        <PreviewRow
          label={copy.successVerified}
          value={user.emailVerified ? copy.verifiedYes : copy.verifiedPending}
        />
        <PreviewRow label={copy.successUpdated} value={formatAdminDate(user.updatedAt, locale)} />
      </div>
      {user.subscriptionUrl && (
        <div className="flex flex-col gap-sm border border-border-visible bg-black p-md">
          <span className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
            {copy.successConfigLabel}
          </span>
          <span className="font-mono text-body-sm text-text-display break-all leading-[1.55]">
            {revealed ? user.subscriptionUrl : maskUrl(user.subscriptionUrl)}
          </span>
          <div className="flex flex-wrap gap-sm">
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="inline-flex min-h-[36px] items-center justify-center border border-border-visible px-md
                         font-mono text-label uppercase tracking-[0.08em] text-text-display
                         hover:border-text-display transition-colors"
            >
              [ {revealed ? copy.successHide : copy.successShow} ]
            </button>
            <button
              type="button"
              onClick={copyUrl}
              className="inline-flex min-h-[36px] items-center justify-center border border-border-visible px-md
                         font-mono text-label uppercase tracking-[0.08em] text-text-display
                         hover:border-text-display transition-colors"
            >
              [ {copyState === "copied" ? copy.successCopied : copy.successCopy} ]
            </button>
          </div>
          {copyState === "error" && (
            <p className="font-body text-body-sm text-accent leading-[1.55]">
              {copy.successCopyError}
            </p>
          )}
        </div>
      )}
      <Link
        href="/dashboard"
        className="self-start font-mono text-label uppercase tracking-[0.08em] text-text-display hover:opacity-80"
      >
        {copy.openDashboard} {"\u2192"}
      </Link>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-md border-t border-border-visible py-md last:border-b">
      <span className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
        {label}
      </span>
      <span className="min-w-0 font-mono text-label uppercase tracking-[0.08em] text-text-display break-words">
        {value}
      </span>
    </div>
  );
}

function AdminNote({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <article className="border border-border-visible rounded-[8px] p-lg min-h-[170px] flex flex-col gap-md">
      <span className="font-mono text-label uppercase tracking-[0.14em] text-text-disabled">
        {index}
      </span>
      <h2 className="font-body font-bold text-text-display text-subheading leading-[1.2]">
        {title}
      </h2>
      <p className="font-body text-body-sm text-text-secondary leading-[1.55]">
        {body}
      </p>
    </article>
  );
}

function validateGrantInput(
  email: string,
  subscriptionUrl: string,
  copy: AdminGrantCopy
): string | null {
  if (!email) return copy.errors.email_required;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return copy.errors.invalid_email;
  }
  if (!subscriptionUrl) return copy.errors.subscription_url_required;
  try {
    const url = new URL(subscriptionUrl);
    const allowed = new Set([
      "https:",
      "http:",
      "vless:",
      "vmess:",
      "trojan:",
      "ss:",
      "hysteria2:",
      "hy2:",
      "wireguard:",
    ]);
    if (!allowed.has(url.protocol)) {
      return copy.errors.invalid_subscription_url;
    }
  } catch {
    return copy.errors.invalid_subscription_url;
  }
  return null;
}

function maskUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.origin !== "null") {
      return `${url.origin}${url.pathname.slice(0, 10)}...`;
    }
    return `${url.protocol}//${url.host || url.pathname.slice(0, 18)}...`;
  } catch {
    return `${value.slice(0, 18)}...`;
  }
}

function formatAdminDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function AdminInput({
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="flex flex-col gap-xs">
      <span className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
        {label}
      </span>
      <input
        type={type}
        required
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="bg-black border border-border-visible rounded-full px-lg min-h-[48px]
                   font-mono text-body-sm text-text-display placeholder:text-text-disabled
                   focus:outline-none focus:border-text-display transition-colors"
      />
    </label>
  );
}

function getCopy(locale: string) {
  return locale === "ru" ? COPY.ru : COPY.en;
}
