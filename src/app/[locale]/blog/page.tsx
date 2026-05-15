import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { DotoNumber } from "@/components/ui/DotoNumber";
import { RevealOnView } from "@/components/ui/RevealOnView";
import { SectionLabel } from "@/components/ui/SectionLabel";

type DevlogEntry = {
  date: string;
  label: string;
  title: string;
  body: string;
  items: string[];
  status: string;
};

type BlogCopy = {
  metaTitle: string;
  metaDescription: string;
  label: string;
  title: string;
  subtitle: string;
  liveLabel: string;
  issueLabel: string;
  nextLabel: string;
  entries: DevlogEntry[];
  footerLabel: string;
  footerText: string;
  cta: string;
};

const DEVLOG: Record<"en" | "ru", BlogCopy> = {
  en: {
    metaTitle: "PRSLOY Devlog",
    metaDescription:
      "Partner and investor-facing PRSLOY build notes: product readiness, infrastructure, auth, risk reduction, and next steps.",
    label: "PARTNER DEVLOG",
    title: "What changed this week",
    subtitle:
      "A public build note for partners and early investors: what moved from idea to production, what risks were reduced, and what still blocks paid launch.",
    liveLabel: "LIVE",
    issueLabel: "FIXED",
    nextLabel: "NEXT",
    entries: [
      {
        date: "15 MAY 2026",
        label: "PRODUCT SURFACE",
        title: "Today: web accounts moved into production",
        body:
          "We removed the Telegram-only bottleneck from the public site. Users can now create a PRSLOY account with email and password, receive verification mail, and land inside a real dashboard shell.",
        items: [
          "Email/password registration and login shipped.",
          "Dashboard reads the signed web session and account state.",
          "Transactional verification emails send from the PRSLOY domain.",
        ],
        status: "LIVE",
      },
      {
        date: "15 MAY 2026",
        label: "RELIABILITY",
        title: "Today: fixed a live scroll crash",
        body:
          "A production-only client crash appeared after the NOTHING section in Chrome. We isolated it to a decorative canvas effect and made that effect fail-soft instead of killing the page.",
        items: [
          "Canvas sampling is guarded.",
          "Animation-frame errors no longer crash the React tree.",
          "The fix was deployed to production.",
        ],
        status: "FIXED",
      },
      {
        date: "14 MAY 2026",
        label: "INFRA + MAIL",
        title: "Yesterday: domain, email, and storage came online",
        body:
          "The public production stack stopped being a mock. The custom domain was connected to Vercel, Resend DNS was verified, and Upstash Redis was attached for lightweight account state.",
        items: [
          "prsloy.online and www.prsloy.online resolve to production.",
          "Waitlist and auth emails are sent through verified Resend DNS.",
          "Redis-backed account storage is live on Vercel.",
        ],
        status: "LIVE",
      },
      {
        date: "12-13 MAY 2026",
        label: "DUE DILIGENCE",
        title: "Earlier: audited the backend boundary",
        body:
          "Before adding payments, we mapped the existing backend and Telegram-based access flow. The useful outcome: the web site now has a clear integration boundary instead of guessing how keys should be issued.",
        items: [
          "Identified the current Telegram auth dependency.",
          "Mapped the subscription/key delivery path.",
          "Flagged missing migration/test coverage before serious scale.",
        ],
        status: "FIXED",
      },
      {
        date: "NEXT",
        label: "COMMERCIAL READINESS",
        title: "Next: connect account -> VPN key before taking money",
        body:
          "We are still not selling access through the site. The next investor-relevant milestone is closing the provisioning loop: account created, access granted, VPN key visible in dashboard, support can trace the account.",
        items: [
          "Attach invite/key issuing to web accounts.",
          "Show issued VPN key and status in the dashboard.",
          "Enable payment only after provisioning is reliable.",
        ],
        status: "NEXT",
      },
    ],
    footerLabel: "WHY PUBLIC",
    footerText:
      "PRSLOY is still beta. This devlog is meant to make progress legible to partners and investors without pretending the commercial flow is finished.",
    cta: "SEE PRICING",
  },
  ru: {
    metaTitle: "PRSLOY Devlog",
    metaDescription:
      "Devlog PRSLOY для партнёров и инвесторов: готовность продукта, инфраструктура, авторизация, риски и следующие шаги.",
    label: "PARTNER DEVLOG",
    title: "Что изменилось за неделю",
    subtitle:
      "Публичный build note для партнёров и ранних инвесторов: что перешло из идеи в production, какие риски закрыли, и что ещё блокирует платный запуск.",
    liveLabel: "LIVE",
    issueLabel: "FIXED",
    nextLabel: "NEXT",
    entries: [
      {
        date: "15 МАЯ 2026",
        label: "PRODUCT SURFACE",
        title: "Сегодня: web-аккаунты выведены в production",
        body:
          "Мы убрали Telegram-only бутылочное горлышко с публичного сайта. Пользователь теперь может создать PRSLOY-аккаунт по email и паролю, получить письмо подтверждения и попасть в реальный каркас кабинета.",
        items: [
          "Регистрация и вход по email/password выкачены.",
          "Кабинет читает подписанную web-сессию и состояние аккаунта.",
          "Письма подтверждения уходят с домена PRSLOY.",
        ],
        status: "LIVE",
      },
      {
        date: "15 МАЯ 2026",
        label: "RELIABILITY",
        title: "Сегодня: починили live-падение при скролле",
        body:
          "В Chrome появилось production-падение после секции NOTHING. Изолировали проблему до декоративного canvas-эффекта и сделали его fail-soft: если эффект ломается, страница продолжает работать.",
        items: [
          "Защитили sampling текста в canvas.",
          "Animation-frame ошибки больше не валят React-дерево.",
          "Фикс выкатили в production.",
        ],
        status: "FIXED",
      },
      {
        date: "14 МАЯ 2026",
        label: "INFRA + MAIL",
        title: "Вчера: подняли домен, почту и хранилище",
        body:
          "Публичный production перестал быть просто макетом. Подключили custom domain к Vercel, подтвердили DNS в Resend и привязали Upstash Redis под лёгкое состояние аккаунтов.",
        items: [
          "prsloy.online и www.prsloy.online ведут на production.",
          "Waitlist и auth-письма уходят через подтверждённый Resend DNS.",
          "Redis-хранилище аккаунтов активно на Vercel.",
        ],
        status: "LIVE",
      },
      {
        date: "12-13 МАЯ 2026",
        label: "DUE DILIGENCE",
        title: "Ранее: разобрали backend boundary",
        body:
          "Перед платёжкой мы разобрали текущий backend и Telegram-based flow выдачи доступа. Практический результат: у сайта теперь есть понятная граница интеграции, а не догадки, где должен появиться ключ.",
        items: [
          "Зафиксировали текущую зависимость от Telegram-auth.",
          "Промапили путь доставки subscription/key.",
          "Отметили риски по миграциям и тестовому покрытию до масштаба.",
        ],
        status: "FIXED",
      },
      {
        date: "NEXT",
        label: "COMMERCIAL READINESS",
        title: "Дальше: связать аккаунт с VPN-ключом до приёма денег",
        body:
          "Мы всё ещё не продаём доступ через сайт. Следующая важная для инвестора веха — закрыть provisioning loop: аккаунт создан, доступ выдан, VPN-ключ виден в кабинете, поддержка может отследить пользователя.",
        items: [
          "Привязать выдачу инвайта/ключа к web-аккаунту.",
          "Показывать VPN-ключ и статус прямо в кабинете.",
          "Включать оплату только после стабильной выдачи ключей.",
        ],
        status: "NEXT",
      },
    ],
    footerLabel: "ЗАЧЕМ ПУБЛИЧНО",
    footerText:
      "PRSLOY всё ещё в beta. Этот devlog нужен, чтобы партнёры и инвесторы видели реальный прогресс без имитации готового commercial flow.",
    cta: "СМОТРЕТЬ ТАРИФ",
  },
};

function getCopy(locale: string) {
  return DEVLOG[locale === "ru" ? "ru" : "en"];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const copy = getCopy(locale);
  return {
    title: copy.metaTitle,
    description: copy.metaDescription,
  };
}

function statusClass(status: string) {
  if (status === "LIVE") return "text-success border-success/50";
  if (status === "FIXED") return "text-text-display border-border-visible";
  return "text-accent border-accent/50";
}

export default async function BlogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const copy = getCopy(locale);

  return (
    <main className="min-h-screen bg-black text-text-primary pt-[120px] pb-3xl">
      <div className="max-w-4xl mx-auto px-lg flex flex-col gap-3xl">
        <RevealOnView y={12}>
          <SectionLabel>{copy.label}</SectionLabel>
        </RevealOnView>

        <RevealOnView delay={0.05}>
          <header className="grid gap-xl lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="flex flex-col gap-lg">
              <h1
                className="font-body font-bold text-text-display leading-[0.95] break-words"
                style={{ fontSize: "clamp(40px, 8vw, 88px)" }}
              >
                {copy.title}
              </h1>
              <p className="font-body text-body text-text-secondary leading-[1.6] max-w-2xl">
                {copy.subtitle}
              </p>
            </div>
            <DotoNumber value={copy.entries.length} unit="NOTES" pulse pulseColor="bg-success" />
          </header>
        </RevealOnView>

        <section className="flex flex-col">
          {copy.entries.map((entry, i) => (
            <RevealOnView key={`${entry.date}-${entry.title}`} delay={0.04 * i}>
              <article
                className={`grid gap-lg py-2xl border-border-visible/50
                            ${i === 0 ? "border-y" : "border-b"}
                            lg:grid-cols-[180px_1fr]`}
              >
                <div className="flex lg:flex-col items-center lg:items-start justify-start gap-md">
                  <div className="flex flex-col gap-xs">
                    <span className="font-mono text-label uppercase tracking-[0.14em] text-text-disabled">
                      {entry.date}
                    </span>
                    <span className="font-mono text-label uppercase tracking-[0.14em] text-text-display">
                      {entry.label}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center min-h-[32px] px-sm rounded-full border
                                font-mono text-[10px] uppercase tracking-[0.12em]
                                ${statusClass(entry.status)}`}
                  >
                    {entry.status}
                  </span>
                </div>

                <div className="flex flex-col gap-lg">
                  <div className="flex flex-col gap-md">
                    <h2 className="font-body font-bold text-text-display text-heading leading-[1.15]">
                      {entry.title}
                    </h2>
                    <p className="font-body text-body text-text-secondary leading-[1.65]">
                      {entry.body}
                    </p>
                  </div>

                  <ul className="grid gap-sm sm:grid-cols-3">
                    {entry.items.map((item) => (
                      <li
                        key={item}
                        className="border border-border-visible/60 rounded-[8px] p-md
                                   font-body text-body-sm text-text-secondary leading-[1.5]"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            </RevealOnView>
          ))}
        </section>

        <RevealOnView>
          <section className="grid gap-lg lg:grid-cols-[180px_1fr] pt-xl border-t border-border-visible">
            <span className="font-mono text-label uppercase tracking-[0.14em] text-text-disabled">
              {copy.footerLabel}
            </span>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-lg">
              <p className="font-body text-body text-text-secondary leading-[1.65] max-w-2xl">
                {copy.footerText}
              </p>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center min-h-[44px]
                           font-mono text-label uppercase tracking-[0.08em]
                           text-text-display hover:opacity-80 transition-opacity"
              >
                {copy.cta} -&gt;
              </Link>
            </div>
          </section>
        </RevealOnView>
      </div>
    </main>
  );
}
