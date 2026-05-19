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
    metaTitle: "PRSLOY · Devlog",
    metaDescription:
      "An open PRSLOY build log: what already works, what we fixed, and what stands between us and paid launch.",
    label: "DEVLOG",
    title: "What changed this week",
    subtitle:
      "An open build log. No pitch deck, no promises — only what is already in production: what started working, what we fixed, and what still stands between us and paid launch.",
    liveLabel: "LIVE",
    issueLabel: "FIXED",
    nextLabel: "NEXT",
    entries: [
      {
        date: "16 MAY 2026",
        label: "ACCESS DELIVERY",
        title: "Accounts and access keys are now connected",
        body:
          "A week ago this was a “next” item. Today it works. We grant access to an account and the access key appears in that person's dashboard right away. The path from sign-up to a working key is closed — for the first time fully on the site, instead of by hand in chat.",
        items: [
          "Internal granting tool — one form: email, key link, done.",
          "The dashboard shows access status and the subscription link itself.",
          "Whole path tested live: sign-up, email verification, grant, key in dashboard.",
        ],
        status: "LIVE",
      },
      {
        date: "16 MAY 2026",
        label: "PRODUCT POLISH",
        title: "The site now reads as a finished product",
        body:
          "Trust is built from small things. Russian text used to fall back to a random system font — different on every device. We set one typeface with real Cyrillic, rebuilt the sign-in and dashboard pages, and tidied the header.",
        items: [
          "One Cyrillic-ready typeface — the site looks identical everywhere.",
          "Sign-in and registration rebuilt: cleaner, more legible, fits any screen.",
          "The header collapses into a small corner mark and opens on hover.",
        ],
        status: "LIVE",
      },
      {
        date: "15 MAY 2026",
        label: "SITE ACCESS",
        title: "Getting in no longer means Telegram",
        body:
          "We removed the main bottleneck: getting inside used to require a Telegram bot. Now a person registers right on the site — email, password, a verification mail — and lands in a real dashboard.",
        items: [
          "Email and password registration and login.",
          "The dashboard recognises the user from a signed session.",
          "Verification emails are sent from the PRSLOY domain.",
        ],
        status: "LIVE",
      },
      {
        date: "15 MAY 2026",
        label: "STABILITY",
        title: "Caught and killed a live scroll crash",
        body:
          "For some Chrome visitors the site crashed while scrolling past a certain point. We traced it to a decorative visual effect and made sure that even if the effect breaks, the page keeps running.",
        items: [
          "Root cause found and closed.",
          "A broken effect no longer takes down the whole page.",
          "The fix is already in production.",
        ],
        status: "FIXED",
      },
      {
        date: "14 MAY 2026",
        label: "INFRASTRUCTURE",
        title: "Production infrastructure: domain, mail, storage",
        body:
          "Production stopped being a mock-up. We connected our own domain, set up email delivery, and attached account storage — the foundation without which neither registration nor key delivery is possible.",
        items: [
          "prsloy.online serves from production.",
          "Email sends from a verified domain — it does not land in spam.",
          "Accounts are kept in fast cloud storage.",
        ],
        status: "LIVE",
      },
      {
        date: "12–13 MAY 2026",
        label: "RECON",
        title: "Mapped how access works under the hood",
        body:
          "Before touching payments, we mapped the existing Telegram-based access flow. The outcome: a clear boundary between where the site ends and key delivery begins. After that we stopped building blind.",
        items: [
          "Documented how access works today.",
          "Mapped the full path — from payment to key.",
          "Found the weak spots before they got expensive.",
        ],
        status: "FIXED",
      },
      {
        date: "NEXT",
        label: "PAID LAUNCH",
        title: "Next step — taking payments",
        body:
          "Access is granted and the key shows in the dashboard — the technical base for selling is ready. One thing is left: wire up payments so the key is issued automatically right after payment, instead of by hand.",
        items: [
          "Connect a payment gateway — SBP, cards, crypto.",
          "Issue the key automatically after a successful payment.",
          "Open sales once automatic delivery is reliable.",
        ],
        status: "NEXT",
      },
    ],
    footerLabel: "WHY PUBLIC",
    footerText:
      "PRSLOY is still in beta. This log keeps progress honest — what works is written down, what does not is said plainly.",
    cta: "SEE PRICING",
  },
  ru: {
    metaTitle: "PRSLOY · Дневник разработки",
    metaDescription:
      "Открытый дневник разработки PRSLOY: что уже работает, что починили и что осталось до платного запуска.",
    label: "ДНЕВНИК РАЗРАБОТКИ",
    title: "Что изменилось за неделю",
    subtitle:
      "Открытый дневник разработки. Без презентаций и обещаний — только то, что уже в продакшене: что заработало, что починили и что пока отделяет нас от платного запуска.",
    liveLabel: "LIVE",
    issueLabel: "FIXED",
    nextLabel: "NEXT",
    entries: [
      {
        date: "16 МАЯ 2026",
        label: "ВЫДАЧА ДОСТУПА",
        title: "Аккаунт и ключ доступа теперь связаны",
        body:
          "Неделю назад это был пункт «дальше». Сегодня — работает. Мы выдаём доступ аккаунту, и ключ доступа сразу появляется у человека в личном кабинете. Путь от регистрации до готового ключа замкнут — впервые целиком на сайте, а не вручную в переписке.",
        items: [
          "Внутренний инструмент выдачи — одна форма: почта, ссылка-ключ, готово.",
          "Кабинет показывает статус доступа и саму ссылку-подписку.",
          "Весь путь проверен вживую: регистрация, подтверждение почты, выдача, ключ в кабинете.",
        ],
        status: "LIVE",
      },
      {
        date: "16 МАЯ 2026",
        label: "ОБЛИК ПРОДУКТА",
        title: "Сайт стал выглядеть как готовый продукт",
        body:
          "Доверие складывается из мелочей. Раньше русский текст показывался случайным системным шрифтом — на каждом устройстве по-своему. Поставили единую типографику с настоящей кириллицей, заново собрали страницы входа и кабинета, навели порядок в шапке.",
        items: [
          "Один шрифт с кириллицей — сайт выглядит одинаково везде.",
          "Вход и регистрация пересобраны: чище, читаемее, под любой экран.",
          "Шапка сворачивается в аккуратную метку и раскрывается по наведению.",
        ],
        status: "LIVE",
      },
      {
        date: "15 МАЯ 2026",
        label: "ДОСТУП НА САЙТ",
        title: "Вход на сайт — больше не только через Telegram",
        body:
          "Убрали главное узкое место: раньше попасть внутрь можно было только через Telegram-бота. Теперь человек регистрируется прямо на сайте — почта, пароль, письмо с подтверждением — и оказывается в личном кабинете.",
        items: [
          "Регистрация и вход по почте и паролю.",
          "Кабинет узнаёт пользователя по защищённой сессии.",
          "Письма с подтверждением уходят с домена PRSLOY.",
        ],
        status: "LIVE",
      },
      {
        date: "15 МАЯ 2026",
        label: "СТАБИЛЬНОСТЬ",
        title: "Поймали и убрали падение сайта при прокрутке",
        body:
          "У части посетителей в Chrome сайт падал при скролле в определённом месте. Нашли причину — декоративный визуальный эффект — и сделали так, что даже если он сломается, страница продолжит работать.",
        items: [
          "Причину нашли и закрыли.",
          "Сбой эффекта больше не роняет страницу целиком.",
          "Исправление уже в продакшене.",
        ],
        status: "FIXED",
      },
      {
        date: "14 МАЯ 2026",
        label: "ИНФРАСТРУКТУРА",
        title: "Боевая инфраструктура: домен, почта, хранилище",
        body:
          "Продакшен перестал быть макетом. Подключили собственный домен, настроили отправку писем и хранилище аккаунтов — фундамент, без которого невозможны ни регистрация, ни выдача ключей.",
        items: [
          "prsloy.online открывается с боевого сервера.",
          "Письма уходят с проверенного домена — не попадают в спам.",
          "Аккаунты хранятся в быстром облачном хранилище.",
        ],
        status: "LIVE",
      },
      {
        date: "12–13 МАЯ 2026",
        label: "РАЗВЕДКА",
        title: "Разобрали, как доступ устроен изнутри",
        body:
          "Перед тем как трогать оплату, мы разобрали существующую механику выдачи доступа через Telegram. Результат — чёткая граница: где заканчивается сайт и начинается выдача ключа. Дальше строили уже не наугад.",
        items: [
          "Зафиксировали, как доступ работает сейчас.",
          "Описали весь путь — от оплаты до ключа.",
          "Нашли слабые места до того, как они стали дорогими.",
        ],
        status: "FIXED",
      },
      {
        date: "ДАЛЬШЕ",
        label: "ПЛАТНЫЙ ЗАПУСК",
        title: "Следующий шаг — приём оплаты",
        body:
          "Доступ выдаётся, ключ виден в кабинете — техническая база под продажу готова. Осталось одно: подключить приём платежей, чтобы ключ выдавался автоматически сразу после оплаты, а не вручную.",
        items: [
          "Подключить платёжный шлюз — СБП, карты, криптовалюта.",
          "Автоматическая выдача ключа после успешной оплаты.",
          "Открыть продажи, когда автовыдача работает стабильно.",
        ],
        status: "NEXT",
      },
    ],
    footerLabel: "ЗАЧЕМ ПУБЛИЧНО",
    footerText:
      "PRSLOY ещё в бете. Этот дневник держит прогресс честным: что работает — то и написано; чего ещё нет — так и сказано.",
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
  return "text-warning border-warning/50";
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
                className="font-body font-bold text-text-display leading-[0.95] tracking-[-0.03em] break-words"
                style={{ fontSize: "clamp(40px, 8vw, 88px)" }}
              >
                {copy.title}
              </h1>
              <p className="font-body text-body text-text-secondary leading-[1.6] max-w-2xl">
                {copy.subtitle}
              </p>
            </div>
            <DotoNumber
              value={String(copy.entries.length).padStart(2, "0")}
              unit="NOTES"
              pulse
              pulseColor="bg-success"
            />
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
                {copy.cta} →
              </Link>
            </div>
          </section>
        </RevealOnView>
      </div>
    </main>
  );
}
