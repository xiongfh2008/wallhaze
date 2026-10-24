"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import {
  AUTH_SERVICES_CONFIGURED,
  authAdapter,
  oauthStartUrl,
  type AuthSession,
} from "@/lib/api/auth";
import { localizePath, safeNextPath } from "@/lib/auth/return-to";
import type { ApiFailure } from "@/lib/api/errors";

function GoogleIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M21.35 11.1h-9.17v2.96h5.34c-.5 2.36-2.44 3.75-5.34 3.75a5.9 5.9 0 1 1 0-11.8c1.5 0 2.86.54 3.92 1.43l2.22-2.22A9 9 0 1 0 21.18 12c0-.3-.02-.6-.05-.9z"
        transform="translate(-2.18 -2.25)"
      />
    </svg>
  );
}

function MailIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className={className}
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

interface AuthPanelProps {
  mode: "login" | "signup";
  /** Same-site page to open after authentication (defaults to /account). */
  returnTo?: string;
}

/** Callback error codes → shipped copy (unknown codes fall back). */
const OAUTH_ERROR_KEYS: Record<string, string> = {
  email_exists: "oauthErrorEmailExists",
  state: "oauthErrorState",
  denied: "oauthErrorDenied",
  failed: "oauthErrorFailed",
  suspended: "oauthErrorSuspended",
  session: "oauthErrorSession",
  unavailable: "oauthErrorUnavailable",
  google_already_linked: "oauthErrorGoogleLinked",
  google_identity_taken: "oauthErrorGoogleTaken",
};

function oauthErrorMessage(
  code: string | null | undefined,
  t: (key: string) => string
): string | null {
  if (!code) return null;
  const key = OAUTH_ERROR_KEYS[code];
  return key ? t(key) : t("oauthErrorFailed");
}

/**
 * Renders the backend's OAuth callback error (`?oauthError=`).
 *
 * It reads search params on the client, so the login page stays statically
 * prerenderable; callers MUST render it inside a Suspense boundary.
 */
export function OAuthErrorNotice() {
  const t = useTranslations("auth");
  const code = useSearchParams().get("oauthError");
  const message = oauthErrorMessage(code, t);
  if (!message) return null;
  return (
    <p role="alert" className="mt-6 text-sm leading-relaxed text-amber-300">
      {message}
    </p>
  );
}

/**
 * Login page client shell. `?next=` and `?oauthError=` are search params, so
 * the page renders this under Suspense and keeps its static prerender.
 */
export function LoginPanel() {
  const next = safeNextPath(useSearchParams().get("next"));
  return (
    <>
      <OAuthErrorNotice />
      <AuthPanel mode="login" returnTo={next} />
    </>
  );
}

/** Maps a transport failure to shipped copy — never leaks server internals. */
function failureMessage(failure: ApiFailure, t: (key: string) => string): string {
  if (failure.kind === "unavailable") return t("errorUnavailable");
  if (failure.kind === "network") return t("errorNetwork");
  if (failure.kind === "timeout") return t("errorNetwork");
  if (failure.kind === "canceled") return t("errorNetwork");
  if (failure.kind === "invalid") return t("errorInvalid");
  if (failure.code === "VALIDATION_ERROR") return t("errorValidation");
  if (failure.code === "CONFLICT") return t("errorConflict");
  if (failure.code === "RATE_LIMITED") return t("errorRateLimited");
  if (failure.status === 401) return t("errorCredentials");
  return t("errorGeneric");
}

/**
 * Sign-in / registration panel (FE05 → R03/R07 integration).
 *
 * With no API configured the panel stays in its honest disabled state: no
 * input fields exist, no fake session is created. Once a backend base URL is
 * configured, real credential forms call the Fastify auth endpoints (cookie
 * session, never a token in browser storage).
 */
export default function AuthPanel({ mode, returnTo = "/account" }: AuthPanelProps) {
  const t = useTranslations("auth");
  const isLogin = mode === "login";

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur">
      <Link
        href="/"
        className="block text-center text-2xl font-semibold tracking-tight"
      >
        Wall
        <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
          Haze
        </span>
      </Link>

      <h1 className="mt-6 text-center text-2xl font-semibold tracking-tight">
        {isLogin ? t("loginTitle") : t("signupTitle")}
      </h1>
      <p className="mt-2 text-center text-sm leading-relaxed text-zinc-400">
        {isLogin ? t("loginSubtitle") : t("signupSubtitle")}
      </p>

      {AUTH_SERVICES_CONFIGURED ? (
        <CredentialForm mode={mode} returnTo={safeNextPath(returnTo)} />
      ) : (
        <DisabledEntries />
      )}

      <p className="mt-6 text-center text-sm text-zinc-400">
        {isLogin ? (
          <Link
            href="/signup"
            className="text-violet-300 underline-offset-4 transition hover:text-violet-200 hover:underline"
          >
            {t("toSignup")}
          </Link>
        ) : (
          <Link
            href="/login"
            className="text-violet-300 underline-offset-4 transition hover:text-violet-200 hover:underline"
          >
            {t("toLogin")}
          </Link>
        )}
      </p>

      <div className="mt-6 border-t border-white/10 pt-5 text-center text-xs leading-relaxed text-zinc-500">
        <p>{t("legalNotice")}</p>
        <p className="mt-2 flex items-center justify-center gap-2">
          <Link
            href="/privacy"
            className="underline-offset-4 transition hover:text-zinc-300 hover:underline"
          >
            {t("privacyLink")}
          </Link>
          <span aria-hidden>·</span>
          <Link
            href="/terms"
            className="underline-offset-4 transition hover:text-zinc-300 hover:underline"
          >
            {t("termsLink")}
          </Link>
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-medium text-zinc-200 transition hover:border-white/35 hover:text-white"
        >
          {t("returnHome")}
        </Link>
      </div>
    </section>
  );
}

/** Unavailable-services state — no credential inputs exist at all. */
function DisabledEntries() {
  const t = useTranslations("auth");
  return (
    <>
      <div
        role="status"
        className="mt-6 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-200"
      >
        {t("serviceNotice")}
      </div>

      <div className="mt-6 space-y-3">
        <Button variant="secondary" size="lg" className="w-full" disabled>
          <GoogleIcon className="h-4 w-4" />
          {t("googleEntry")}
        </Button>
        <Button variant="secondary" size="lg" className="w-full" disabled>
          <MailIcon className="h-4 w-4" />
          {t("emailEntry")}
        </Button>
        <p className="text-center text-xs text-zinc-500">{t("disabledHint")}</p>
      </div>
    </>
  );
}

/**
 * Google entry point. Availability comes from the backend's capability
 * endpoint on mount — the button is never enabled on a guess, and a failed
 * request degrades to the honest "not configured" state.
 */
function GoogleEntry({ returnTo }: { returnTo: string }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [configured, setConfigured] = useState<boolean | null>(
    AUTH_SERVICES_CONFIGURED ? null : false
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!AUTH_SERVICES_CONFIGURED) return;
    let cancelled = false;
    void authAdapter.getOAuthStatus().then((result) => {
      if (!cancelled) {
        setConfigured(result.ok && result.data.google === true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const start = () => {
    const url = oauthStartUrl("signin", localizePath(locale, returnTo));
    if (!url) return;
    setBusy(true);
    window.location.assign(url);
  };

  return (
    <div className="mt-6 space-y-3">
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full"
        disabled={configured !== true || busy}
        onClick={start}
      >
        <GoogleIcon className="h-4 w-4" />
        {t("googleEntry")}
      </Button>
      <p className="text-center text-xs leading-relaxed text-zinc-500">
        {configured === true
          ? t("oauthHint")
          : configured === false
            ? t("oauthUnavailable")
            : t("oauthChecking")}
      </p>
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-zinc-600">
        <span className="h-px flex-1 bg-white/10" aria-hidden />
        <span>{t("oauthDivider")}</span>
        <span className="h-px flex-1 bg-white/10" aria-hidden />
      </div>
    </div>
  );
}

/** Real credential form against the configured backend. */
function CredentialForm({ mode, returnTo = "/account" }: AuthPanelProps) {
  const t = useTranslations("auth");
  const router = useRouter();
  const isLogin = mode === "login";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    // Mirror the backend's minimal client-side shape checks only; the
    // server remains the authority for everything else.
    if (!email.trim() || password.length < 8) {
      setError(t("errorValidation"));
      return;
    }
    setBusy(true);
    try {
      const result = isLogin
        ? await authAdapter.signInWithPassword(email.trim(), password)
        : await authAdapter.signUpWithPassword(email.trim(), password);
      if (!result.ok) {
        setError(failureMessage(result.failure, t));
        return;
      }
      // The session cookie is already set; the router refresh re-renders
      // server components that read it. `returnTo` is a validated same-site
      // path, so login from Studio/Credits/My Creations lands back there.
      router.push(returnTo);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6">
      <GoogleEntry returnTo={returnTo} />
      <form
        className="mt-6 space-y-3"
        onSubmit={(event) => void onSubmit(event)}
        noValidate
      >
      <label className="block text-sm text-zinc-300">
        <span className="mb-1.5 block">{t("emailLabel")}</span>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          disabled={busy}
        />
      </label>
      <label className="block text-sm text-zinc-300">
        <span className="mb-1.5 block">{t("passwordLabel")}</span>
        <Input
          type="password"
          name="password"
          autoComplete={isLogin ? "current-password" : "new-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          required
          disabled={busy}
        />
        <span className="mt-1 block text-xs text-zinc-500">
          {t("passwordHint")}
        </span>
      </label>

      {error ? (
        <p role="alert" className="text-sm text-amber-300">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        <MailIcon className="h-4 w-4" />
        {busy
          ? t("submitting")
          : isLogin
            ? t("submitLogin")
            : t("submitSignup")}
      </Button>
      </form>
    </div>
  );
}

// Re-exported so the session type stays discoverable next to its panel.
export type { AuthSession };
