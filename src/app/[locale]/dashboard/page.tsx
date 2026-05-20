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
    "title",
    "subtitle",
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
    "email_label",
    "email_verified",
    "email_pending",
    "access_label",
    "access_active",
    "access_pending",
    "key_label",
    "key_ready",
    "key_not_issued",
    "status_ready_title",
    "status_ready_body",
    "status_pending_title",
    "status_pending_body",
    "status_blocked_title",
    "status_blocked_body",
    "vpn_section_label",
    "key_ready_body",
    "key_pending_body",
    "config_label",
    "copy_key",
    "copy_done",
    "copy_error",
    "show_key",
    "hide_key",
    "open_key",
    "setup_link",
    "next_label",
    "next_active_1_title",
    "next_active_1_body",
    "next_pending_1_title",
    "next_pending_1_body",
    "reissue_title",
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
    "support_title",
    "support_body",
    "support_link",
    "account_label",
    "account_created_label",
    "updated_label",
    "logout",
  ] as const;

  const copy = Object.fromEntries(keys.map((key) => [key, t(key)])) as DashboardCopy;

  return <DashboardClient locale={locale} copy={copy} />;
}
