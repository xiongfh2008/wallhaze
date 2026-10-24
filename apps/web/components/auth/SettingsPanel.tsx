"use client";

import { Suspense, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import {
  AUTH_SERVICES_CONFIGURED,
  authAdapter,
  oauthStartUrl,
  type AuthUser,
} from "@/lib/api/auth";
import { loginHref } from "@/lib/auth/return-to";

/**
 * Account settings panel (R03): real sign-out plus the honest signed-out /
 * not-configured states. Account deletion is intentionally not offered.
 *
 * Google linking is EXPLICIT: an existing email/password account is never
 * merged with a Google identity automatically (see DECISIONS.md); the user
 * starts the link flow here while signed in.
 */

type State =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "signed-out" }
  | { kind: "signed-in"; user: AuthUser };

export default function SettingsPanel() {
  const t = useTranslations("account");
  const locale = useLocale();
  const router = useRouter();
  const [state, setState] = useState<State>(
    AUTH_SERVICES_CONFIGURED ? { kind: "loading" } : { kind: "unavailable" }
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [google, setGoogle] = useState<{
    configured: boolean;
    linked: boolean;
  } | null>(null);

  useEffect(() => {
    if (!AUTH_SERVICES_CONFIGURED) return;
    let cancelled = false;
    void (async () => {
      const session = await authAdapter.getSession();
      if (cancelled) return;
      if (!session.ok) {
        setState({ kind: "unavailable" });
        return;
      }
      setState(
        session.data
          ? { kind: "signed-in", user: session.data.user }
          : { kind: "signed-out" }
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state.kind !== "signed-in") return;
    let cancelled = false;
    void (async () => {
      const [status, links] = await Promise.all([
        authAdapter.getOAuthStatus(),
        authAdapter.getOAuthLinks(),
      ]);
      if (cancelled) return;
      setGoogle({
        configured: status.ok && status.data.google === true,
        linked: links.ok && links.data.google === true,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [state]);

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await authAdapter.signOut();
      if (!result.ok) {
        setError(t("signOutFailed"));
        return;
      }
      setState({ kind: "signed-out" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const linkGoogle = () => {
    const returnTo =
      locale === "en" ? "/account/settings" : `/${locale}/account/settings`;
    const url = oauthStartUrl("link", returnTo);
    if (url) window.location.assign(url);
  };

  if (state.kind === "loading") {
    return (
      <p className="mt-8 text-sm text-zinc-500" aria-busy>
        {t("loading")}
      </p>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <div
        role="status"
        className="mt-8 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-5 py-4 text-sm leading-relaxed text-amber-200"
      >
        {t("settingsUnavailableNotice")}
      </div>
    );
  }

  if (state.kind === "signed-out") {
    return (
      <section
        aria-labelledby="settings-signin"
        className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-8"
      >
        <h2 id="settings-signin" className="text-lg font-semibold">
          {t("signInPromptTitle")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          {t("signInPromptBody")}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button href={loginHref("/account/settings")}>
            {t("signInAction")}
          </Button>
          <Button href="/signup" variant="secondary">
            {t("createAccountAction")}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="settings-signout"
      className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-8"
    >
      <h2 id="settings-signout" className="text-lg font-semibold">
        {t("signOutTitle")}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        {t("signOutBody")}
      </p>
      <p className="mt-2 text-xs text-zinc-500">{state.user.email ?? "—"}</p>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-amber-300">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        <Button variant="secondary" onClick={() => void signOut()} disabled={busy}>
          {busy ? t("signingOut") : t("signOutButton")}
        </Button>
      </div>

      <section
        aria-labelledby="settings-google"
        className="mt-8 border-t border-white/10 pt-6"
      >
        <h3 id="settings-google" className="text-sm font-semibold text-zinc-100">
          {t("googleLinkTitle")}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-zinc-400">
          {t("googleLinkBody")}
        </p>
        <Suspense fallback={null}>
          <OAuthLinkedNotice />
        </Suspense>        {google === null ? (
          <p className="mt-3 text-xs text-zinc-500" aria-busy>
            {t("googleLinkChecking")}
          </p>
        ) : !google.configured ? (
          <p className="mt-3 text-xs text-zinc-500">{t("googleUnavailable")}</p>
        ) : google.linked ? (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            {t("googleLinked")}
          </p>
        ) : (
          <div className="mt-3">
            <Button variant="secondary" onClick={linkGoogle}>
              {t("googleLinkAction")}
            </Button>
          </div>
        )}
      </section>
    </section>
  );
}

/**
 * Success notice for `?oauth=linked`. It reads search params on the client,
 * so the settings page itself keeps prerendering; the caller supplies the
 * Suspense boundary.
 */
function OAuthLinkedNotice() {
  const t = useTranslations("account");
  const linked = useSearchParams().get("oauth") === "linked";
  if (!linked) return null;
  return (
    <p role="status" className="mt-3 text-sm text-emerald-300">
      {t("googleLinkedNotice")}
    </p>
  );
}
