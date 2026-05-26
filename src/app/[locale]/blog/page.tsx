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
        date: "26 MAY 2026",
        label: "ANALYTICS",
        title: "Our own analytics loop",
        body:
          "Before turning on advertising, we wired up our own counter. We see visits, traffic sources, the funnel from sign-up to payment, and revenue per source. No third-party SDKs, no tracking cookies — visitors stay first-party. An internal page shows everything live for any date.",
        items: [
          "Counters for visits and traffic sources.",
          "Funnel: register → pay → key issued.",
          "Daily revenue is counted exactly once even on retry from the payment provider.",
        ],
        status: "LIVE",
      },
      {
        date: "26 MAY 2026",
        label: "INVITES",
        title: "Self-serve invite codes and a public slot counter",
        body:
          "Beta access is now fully self-serve. The Telegram bot's /invite command hands the visitor a fresh code with a one-click magic link — no operator in the loop. The pricing page shows the honest remaining-slots number for the current round. An email channel is the fallback for people without Telegram.",
        items: [
          "Bot /invite: unique code + magic link in seconds.",
          "Live counter of remaining paying slots on the pricing page.",
          "Email request as a fallback for visitors without Telegram.",
        ],
        status: "LIVE",
      },
      {
        date: "25 MAY 2026",
        label: "TELEGRAM SIGN-IN",
        title: "One-tap sign-in through Telegram",
        body:
          "Sign-up and sign-in via the Telegram bot. No passwords, no verification mail — open the deep link, tap Confirm in the bot, you are in the dashboard. Each new visitor spends one invite code; returning users sign in free. Email sign-in stays as a fallback for those without Telegram.",
        items: [
          "Secure server-side session right after bot confirmation.",
          "Invite code is consumed atomically — single-use guaranteed.",
          "Email and password sign-in remains as an alternative path.",
        ],
        status: "LIVE",
      },
      {
        date: "24 MAY 2026",
        label: "PRICING + DASHBOARD",
        title: "Pricing and dashboard pulled into the minimal language",
        body:
          "Both pages rebuilt under one aesthetic: a single dominant element per screen, no unnecessary boxes, monospaced data as a standalone visual. Pricing is a single column with the centerpiece price in a pixel face. The dashboard reads access state and the key at first glance — no scrolling, no labels you have to think about.",
        items: [
          "Pricing: $5 / 500₽ as the visual centerpiece, other periods compact.",
          "Dashboard: access state legible without scroll or hint text.",
          "Subscription status redrawn as a single horizontal strip.",
        ],
        status: "LIVE",
      },
      {
        date: "21 MAY 2026",
        label: "PAYMENTS",
        title: "SBP and USDT payments live in production",
        body:
          "We connected payment intake: SBP through a bank-app QR code and USDT crypto. Both paths land in the same checkout. The subscription is recorded the moment payment lands — the customer sees the active state immediately. The access key itself is still issued by the operator; automating that hand-off is next.",
        items: [
          "SBP QR — one tap in a banking app.",
          "USDT — a standard crypto checkout.",
          "Refund terms are published before payment is taken.",
        ],
        status: "LIVE",
      },
      {
        date: "21 MAY 2026",
        label: "SUPPORT",
        title: "Support and refund rules are now public",
        body:
          "The product can now pass a basic bank review: there is a working support channel, a public refund page, and a clear place where a customer can ask for help without hunting for a private chat.",
        items: [
          "Support points to the public PRSLOY Telegram account.",
          "Refund terms are published in Russian and English.",
          "Footer, pricing, and sitemap now expose the policy page.",
        ],
        status: "LIVE",
      },
      {
        date: "21 MAY 2026",
        label: "OPERATOR PANEL",
        title: "Admin work is no longer trapped in chat",
        body:
          "Manual operations now have a proper internal panel. We can see accounts, grant access, process key reissue requests, and remove test accounts without touching storage by hand.",
        items: [
          "Admin pages are localized and connected to each other.",
          "Operators can grant a key by email and subscription link.",
          "Test accounts can be deleted from the user list.",
        ],
        status: "LIVE",
      },
      {
        date: "20 MAY 2026",
        label: "CABINET",
        title: "The dashboard became a customer page, not an engineering console",
        body:
          "The first dashboard was too noisy. We cut it down to what a normal customer needs: access status, the current key, setup, key replacement, support, and account controls.",
        items: [
          "Less internal wording and fewer distracting metrics.",
          "Setup and reissue actions are visible where the user expects them.",
          "The page now matches the minimal PRSLOY visual language.",
        ],
        status: "LIVE",
      },
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
        label: "AUTO KEY DELIVERY",
        title: "Next step — issue the VPN key automatically at payment",
        body:
          "The single manual step left. After a successful payment the key is still handed out by the operator — we need to wire key generation into the payment confirmation itself. Once that lands, the path from first visit to a working VPN connection closes completely without a human in the loop.",
        items: [
          "Subscription URL generated on the VPN backend on demand.",
          "Trigger on a successful payment confirmation.",
          "Key delivered to Telegram and email seconds after payment.",
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
        date: "26 МАЯ 2026",
        label: "АНАЛИТИКА",
        title: "Свой аналитический контур",
        body:
          "Перед запуском рекламы поставили собственный счётчик. Видим визиты, источники трафика, воронку от регистрации до оплаты и выручку по каждому источнику. Без сторонних сервисов и трекинг-куки — посетитель остаётся в первой стороне. Внутренняя страница показывает всё в реальном времени за любую дату.",
        items: [
          "Счётчики посещений и источников трафика.",
          "Воронка: регистрация → оплата → выдача ключа.",
          "Выручка за день учитывается ровно один раз даже при повторных уведомлениях от платёжки.",
        ],
        status: "LIVE",
      },
      {
        date: "26 МАЯ 2026",
        label: "ИНВАЙТЫ",
        title: "Автовыдача инвайтов и публичный счётчик слотов",
        body:
          "Доступ в бету теперь полностью самообслуживаемый. Telegram-бот по команде /invite сам выдаёт человеку код доступа со ссылкой-магнитом — оператор не нужен. На странице тарифа честный счётчик: сколько мест осталось в текущем раунде. Альтернативный канал — запрос инвайта по email прямо со страницы тарифа.",
        items: [
          "Бот /invite: уникальный код и ссылка-магнит за секунду.",
          "Публичный счётчик оставшихся мест в реальном времени.",
          "Запрос по email — fallback для тех, кто без Telegram.",
        ],
        status: "LIVE",
      },
      {
        date: "25 МАЯ 2026",
        label: "TELEGRAM ВХОД",
        title: "Вход через Telegram одним тапом",
        body:
          "Регистрация и вход через Telegram-бот. Никаких паролей и писем с подтверждением — открыл deep-link, нажал «Подтвердить» в боте, оказался в кабинете. Каждый новый юзер тратит один инвайт-код; возвращающийся входит бесплатно. Вход по почте остаётся как fallback.",
        items: [
          "Безопасная серверная сессия после подтверждения в боте.",
          "Инвайт-код списывается атомарно — повторно использовать нельзя.",
          "Email и пароль остаются как альтернативный путь.",
        ],
        status: "LIVE",
      },
      {
        date: "24 МАЯ 2026",
        label: "ТАРИФ + КАБИНЕТ",
        title: "Тариф и кабинет приведены к минимальному языку",
        body:
          "Обе страницы пересобраны под одну эстетику: одна доминанта на экран, никаких лишних коробок, моноширинные данные как самостоятельный визуал. Тариф — единая колонка с центральной ценой пиксельным шрифтом. Кабинет — без карточек и шума, состояние и ключ читаются с первого взгляда.",
        items: [
          "Тариф: $5 / 500₽ крупным пиксельным шрифтом, остальные периоды компактно.",
          "Кабинет: статус доступа считывается без скроллов и подписей.",
          "Подписочный блок переделан в единую горизонтальную строку.",
        ],
        status: "LIVE",
      },
      {
        date: "21 МАЯ 2026",
        label: "ОПЛАТА",
        title: "СБП и USDT в проде",
        body:
          "Подключили приём платежей: СБП через QR-код в банковском приложении и USDT-крипта. Оба способа выходят на один и тот же чекаут. Подписка фиксируется в момент успешной оплаты — клиент видит активное состояние сразу. Ключ доступа пока выдаётся оператором; автоматизация выдачи следующая в очереди.",
        items: [
          "СБП QR — один тап в банковском приложении.",
          "USDT — стандартный криптовалютный чекаут.",
          "Правила возврата опубликованы и доступны до оплаты.",
        ],
        status: "LIVE",
      },
      {
        date: "21 МАЯ 2026",
        label: "ПОДДЕРЖКА",
        title: "Поддержка и правила возврата теперь публичные",
        body:
          "Проект теперь выглядит нормально для проверки банком: есть рабочий канал связи, открытая страница возвратов и понятное место, куда клиент пишет, если что-то не работает.",
        items: [
          "Поддержка ведет на публичный аккаунт PRSLOY в Telegram.",
          "Условия возврата опубликованы на русском и английском.",
          "Ссылки на правила добавлены в футер, тариф и sitemap.",
        ],
        status: "LIVE",
      },
      {
        date: "21 МАЯ 2026",
        label: "АДМИНКА",
        title: "Ручные операции вынесли из переписок",
        body:
          "У внутренних действий появился нормальный интерфейс. Можно видеть аккаунты, выдавать доступ, закрывать заявки на перевыпуск ключа и удалять тестовые аккаунты без ручного ковыряния в хранилище.",
        items: [
          "Админские страницы переведены и связаны между собой.",
          "Доступ выдается по email и ссылке-подписке.",
          "Тестовые аккаунты можно удалить из списка пользователей.",
        ],
        status: "LIVE",
      },
      {
        date: "20 МАЯ 2026",
        label: "КАБИНЕТ",
        title: "Личный кабинет стал страницей клиента, а не инженерной панелью",
        body:
          "Первый кабинет был перегружен. Мы оставили то, что реально нужно человеку: статус доступа, текущий ключ, инструкцию по устройствам, перевыпуск ключа, поддержку и управление аккаунтом.",
        items: [
          "Меньше внутренней терминологии и лишних метрик.",
          "Настройка и перевыпуск ключа находятся рядом с доступом.",
          "Страница стала ближе к минимальному языку PRSLOY.",
        ],
        status: "LIVE",
      },
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
        label: "АВТОВЫДАЧА КЛЮЧА",
        title: "Следующий шаг — автовыдача VPN-ключа в момент оплаты",
        body:
          "Единственное звено, которое ещё проходит через оператора. После успешной оплаты ключ доступа сейчас выдаётся вручную — нужно встроить генерацию ключа в момент подтверждения платежа. После этого путь от первого визита до работающего VPN-соединения закрывается полностью без участия человека.",
        items: [
          "Генерация подписочной ссылки на VPN-бэкенде по требованию.",
          "Триггер на успешное подтверждение оплаты.",
          "Ключ приходит в Telegram и на email через секунды после оплаты.",
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
