import { getTranslations, setRequestLocale } from "next-intl/server";
import { DashboardClient, type DashboardCopy } from "@/components/auth/DashboardClient";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "dashboard_page" });

  const keys = [
    "label",
    "setup_title",
    "setup_body",
    "loading_body",
    "auth_required_label",
    "auth_required_body",
    "login_link",
    "register_link",
    "verify_title",
    "verify_body",
    "verify_resend",
    "verify_sent",
    "verify_error",
    "access_label",
    "status_ready_title",
    "status_ready_body",
    "status_pending_title",
    "status_pending_body",
    "status_paid_awaiting_title",
    "status_paid_awaiting_body",
    "status_issue_failed_title",
    "status_issue_failed_body",
    "status_blocked_title",
    "status_blocked_body",
    "key_ready_body",
    "key_pending_body",
    "copy_key",
    "copy_done",
    "copy_error",
    "show_key",
    "hide_key",
    "setup_link",
    "pay_cta",
    "reissue_body",
    "reissue_button",
    "reissue_disabled",
    "reissue_sending",
    "reissue_sent",
    "reissue_sent_body",
    "reissue_error_body",
    "reissue_rate_limited",
    "reissue_no_key",
    "reissue_auth_required",
    "support_body",
    "support_link",
    "logout",
  ] as const;

  const copy = Object.fromEntries(keys.map((key) => [key, t(key)])) as DashboardCopy;

  return <DashboardClient locale={locale} copy={copy} />;
}
