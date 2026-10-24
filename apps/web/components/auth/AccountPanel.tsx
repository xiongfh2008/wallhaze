"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import {
  AUTH_SERVICES_CONFIGURED,
  authAdapter,
  type AuthUser,
} from "@/lib/api/auth";
import { loginHref } from "@/lib/auth/return-to";

/**
 * Account summary (R03/R07). Shows the real session when one exists and a
 * sign-out control; otherwise the honest signed-out or not-configured state.
 * Never renders a fabricated user.
 */
export default function AccountPanel() {
  const t = useTranslations("account");
  const router = useRouter();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "unavailable" }
    | { kind: "signed-out" }
    | { kind: "signed-in"; user: AuthUser }
  >(AUTH_SERVICES_CONFIGURED ? { kind: "loading" } : { kind: "unavailable" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (state.kind === "loading") {
    return (
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm text-zinc-400" aria-busy>
        {t("loading")}
      </div>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <div
        role="status"
        className="mt-8 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-5 py-4 text-sm leading-relaxed text-amber-200"
      >
        {t("unavailableNotice")}
      </div>
    );
  }

  if (state.kind === "signed-out") {
    return (
      <section
        aria-labelledby="account-signin-prompt"
        className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-8"
      >
        <h2 id="account-signin-prompt" className="text-lg font-semibold">
          {t("signInPromptTitle")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          {t("signInPromptBody")}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button href={loginHref("/account")}>{t("signInAction")}</Button>
          <Button href="/signup" variant="secondary">
            {t("createAccountAction")}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="account-profile"
      className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-8"
    >
      <h2 id="account-profile" className="text-lg font-semibold">
        {t("signedInTitle")}
      </h2>
      <p className="mt-3 text-sm text-zinc-400">{t("signedInAs")}</p>
      <p className="mt-1 font-medium text-zinc-100">{state.user.email ?? "—"}</p>
      {state.user.displayName ? (
        <p className="mt-1 text-sm text-zinc-400">{state.user.displayName}</p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-sm text-amber-300">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => void signOut()} disabled={busy}>
          {busy ? t("signingOut") : t("signOutAction")}
        </Button>
        <Button href="/credits" variant="ghost">
          {t("openCredits")}
        </Button>
        <Button href="/my-creations" variant="ghost">
          {t("openCreations")}
        </Button>
      </div>
    </section>
  );
}
