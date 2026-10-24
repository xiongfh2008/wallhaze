"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import type { ApiFailure } from "@/lib/api/errors";
import { authAdapter } from "@/lib/api/auth";
import { loginHref } from "@/lib/auth/return-to";
import {
  CREDIT_WALLET_SERVICES_CONFIGURED,
  creditsAdapter,
  type CreditPackage,
  type CreditTransaction,
  type CreditsPricing,
  type PaymentOrder,
  type WalletBalance,
} from "@/lib/api/credits";

/**
 * Live Credits panel (R07 integration).
 *
 * Three honest states, never blurred:
 * - services not configured → the original "not connected" copy, no numbers;
 * - signed out → the sign-in prompt (rendered by the page);
 * - signed in → the backend's real balance, packages, ledger and orders.
 * Checkout stays disabled while no real payment provider exists.
 */

type LoadState =
  | { state: "unavailable" }
  | { state: "signed-out" }
  | { state: "loading" }
  | { state: "error"; failure: ApiFailure }
  | {
      state: "ready";
      wallet: WalletBalance;
      packages: CreditPackage[];
      transactions: CreditTransaction[];
      orders: PaymentOrder[];
      pricing: CreditsPricing;
    };

function money(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

/** Unit price with enough precision to compare packages honestly. */
function moneyPerCredit(
  amountMinor: number,
  credits: number,
  currency: string,
  locale: string
): string {
  if (credits <= 0) return "—";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 3,
    }).format(amountMinor / credits / 100);
  } catch {
    return `${(amountMinor / credits / 100).toFixed(3)} ${currency}`;
  }
}

type HistoryFilter = "all" | "topups" | "usage" | "adjustments" | "internal";

/**
 * Ledger reasons are split into what a normal user cares about (top-ups,
 * refunds, adjustments, real AI usage) and reservation-only internals.
 * Internal rows are never presented as 0-Credit charges.
 */
function transactionGroup(
  reason: string | null,
  reservedDelta: number
): Exclude<HistoryFilter, "all"> {
  if (reason === "purchase" || reason === "refund") return "topups";
  if (reason === "ops.grant") return "adjustments";
  if (reason === "generation.captured") return "usage";
  if (
    reason === "generation.reserved" ||
    reason === "generation.released" ||
    reason === "generation.mock" ||
    reservedDelta !== 0
  ) {
    return "internal";
  }
  return "adjustments";
}

const HISTORY_LIMIT = 20;

export default function CreditsClient({ locale }: { locale: string }) {
  const t = useTranslations("wallet");
  const [data, setData] = useState<LoadState>(
    CREDIT_WALLET_SERVICES_CONFIGURED
      ? { state: "loading" }
      : { state: "unavailable" }
  );
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [visibleHistory, setVisibleHistory] = useState(HISTORY_LIMIT);
  const [syncingOrder, setSyncingOrder] = useState<string | null>(null);
  const [orderNotice, setOrderNotice] = useState<string | null>(null);
  // One idempotency key per package per page session: a double click or a
  // retry returns the SAME provider session instead of creating an order.
  const checkoutKeys = useRef<Record<string, string>>({});

  /**
   * Starts a real provider checkout. The session is created server-side;
   * the browser only follows the returned URL. No payment is simulated.
   */
  const startCheckout = async (pkg: CreditPackage): Promise<void> => {
    if (checkingOut) return;
    setCheckoutError(null);
    setCheckingOut(pkg.id);
    try {
      const idempotencyKey =
        checkoutKeys.current[pkg.id] ??= crypto.randomUUID();
      const pageUrl = `${window.location.origin}${window.location.pathname}`;
      const result = await creditsAdapter.createCheckout(
        { packageId: pkg.id, successUrl: pageUrl, cancelUrl: pageUrl },
        idempotencyKey
      );
      if (!result.ok) {
        setCheckoutError(t("checkoutFailed"));
        return;
      }
      window.location.assign(result.data.checkoutUrl);
    } catch {
      setCheckoutError(t("checkoutFailed"));
    } finally {
      setCheckingOut(null);
    }
  };

  /**
   * Ledger reasons and order statuses come from the server and may grow.
   * next-intl throws on unknown keys, so fall back to the raw value instead
   * of taking the whole page down.
   */
  const safeMessage = (key: string, fallback: string): string => {
    try {
      return t(key as never);
    } catch {
      return fallback;
    }
  };

  useEffect(() => {
    if (!CREDIT_WALLET_SERVICES_CONFIGURED) return;
    let cancelled = false;
    void (async () => {
      const session = await authAdapter.getSession();
      if (cancelled) return;
      if (!session.ok) {
        setData({ state: "unavailable" });
        return;
      }
      if (session.data === null) {
        setData({ state: "signed-out" });
        return;
      }
      const loadAll = async () =>
        Promise.all([
          creditsAdapter.getWallet(),
          creditsAdapter.listCreditPackages(),
          creditsAdapter.listCreditTransactions(),
          creditsAdapter.listPaymentOrders(),
          creditsAdapter.getPricing(),
        ]);
      const [wallet, packages, transactions, orders, pricing] = await loadAll();
      if (cancelled) return;
      if (!wallet.ok || !packages.ok || !transactions.ok || !orders.ok || !pricing.ok) {
        const failure =
          (!wallet.ok && wallet.failure) ||
          (!packages.ok && packages.failure) ||
          (!transactions.ok && transactions.failure) ||
          (!orders.ok && orders.failure) ||
          (!pricing.ok && pricing.failure) ||
          { kind: "network" as const };
        setData({ state: "error", failure });
        return;
      }
      setData({
        state: "ready",
        wallet: wallet.data,
        packages: packages.data,
        transactions: transactions.data,
        orders: orders.data,
        pricing: pricing.data,
      });

      // Return-from-checkout reconciliation. Webhooks cannot reach a local
      // deployment (and can lag in production), so pending orders are
      // verified directly with the provider. `?order=` identifies the order
      // the cashier sent us back for; all pending orders are also retried.
      const orderFromUrl = new URLSearchParams(window.location.search).get(
        "order"
      );
      const pending = orders.data
        .filter((order) => order.status === "pending")
        .map((order) => order.id);
      const toSync = Array.from(
        new Set([...(orderFromUrl ? [orderFromUrl] : []), ...pending])
      ).slice(0, 5);
      let applied = false;
      for (const orderId of toSync) {
        const result = await creditsAdapter.syncOrder(orderId);
        if (cancelled) return;
        if (result.ok && result.data.applied) applied = true;
      }
      if (!applied || cancelled) return;
      const refreshed = await loadAll();
      if (cancelled) return;
      const [w2, p2, t2, o2, pr2] = refreshed;
      if (w2.ok && p2.ok && t2.ok && o2.ok && pr2.ok) {
        setData({
          state: "ready",
          wallet: w2.data,
          packages: p2.data,
          transactions: t2.data,
          orders: o2.data,
          pricing: pr2.data,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (data.state === "unavailable") {
    return (
      <>
        <section aria-labelledby="wallet-balance" className="mt-10">
          <h2 id="wallet-balance" className="text-lg font-semibold">
            {t("balanceTitle")}
          </h2>
          <div
            role="status"
            className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-8"
          >
            <p className="text-sm leading-relaxed text-zinc-400">
              {t("balanceUnavailable")}
            </p>
            <p className="mt-2 text-xs text-zinc-500">{t("balanceHint")}</p>
          </div>
        </section>
        <section aria-labelledby="wallet-packages" className="mt-10">
          <h2 id="wallet-packages" className="text-lg font-semibold">
            {t("packagesTitle")}
          </h2>
          <p className="mt-2 text-sm text-zinc-500">{t("packagesUnavailable")}</p>
          <EmptyState
            className="mt-4"
            title={t("packagesEmptyTitle")}
            body={t("packagesEmptyBody")}
          />
        </section>
        <section aria-labelledby="wallet-transactions" className="mt-10">
          <h2 id="wallet-transactions" className="text-lg font-semibold">
            {t("transactionsTitle")}
          </h2>
          <p className="mt-2 text-sm text-zinc-500">
            {t("transactionsUnavailable")}
          </p>
          <EmptyState
            className="mt-4"
            title={t("transactionsEmptyTitle")}
            body={t("transactionsEmptyBody")}
          />
        </section>
        <section aria-labelledby="wallet-orders" className="mt-10">
          <h2 id="wallet-orders" className="text-lg font-semibold">
            {t("ordersTitle")}
          </h2>
          <p className="mt-2 text-sm text-zinc-500">{t("ordersUnavailable")}</p>
          <EmptyState
            className="mt-4"
            title={t("ordersEmptyTitle")}
            body={t("ordersEmptyBody")}
          />
        </section>
      </>
    );
  }

  if (data.state === "signed-out") {
    return (
      <section
        aria-labelledby="wallet-signin"
        className="mt-10 rounded-3xl border border-white/10 bg-white/[0.03] p-8"
      >
        <h2 id="wallet-signin" className="text-lg font-semibold">
          {t("signInPromptTitle")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          {t("signInPromptBody")}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button href={loginHref("/credits")} variant="secondary">
            {t("signInAction")}
          </Button>
          <Button href="/signup" variant="ghost">
            {t("createAccountAction")}
          </Button>
        </div>
        <p className="mt-4 text-xs text-zinc-500">
          <Link href="/faq" className="underline-offset-4 hover:underline">
            {t("faqTitle")}
          </Link>
        </p>
      </section>
    );
  }

  if (data.state === "loading") {
    return (
      <div className="mt-10 space-y-4" aria-busy>
        <p className="text-sm text-zinc-500">{t("loading")}</p>
        <Skeleton className="h-28 rounded-3xl" />
        <Skeleton className="h-24 rounded-3xl" />
      </div>
    );
  }

  if (data.state === "error") {
    return (
      <div
        role="alert"
        className="mt-10 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-5 py-4 text-sm leading-relaxed text-amber-200"
      >
        {t("loadFailed")}
      </div>
    );
  }

  const reserved = data.wallet.reserved ?? 0;
  const available = Math.max(0, data.wallet.credits - reserved);
  const price = data.pricing.creditsPerGeneration;
  const estimated = price > 0 ? Math.floor(available / price) : null;
  const unitPrices = data.packages.map(
    (pkg) => pkg.priceMinorUnits / pkg.credits
  );
  const minUnitPrice = unitPrices.length > 0 ? Math.min(...unitPrices) : null;
  const bestValueCandidates =
    minUnitPrice === null
      ? []
      : data.packages.filter(
          (pkg) => pkg.priceMinorUnits / pkg.credits === minUnitPrice
        );
  const bestValueId =
    bestValueCandidates.length === 1 ? bestValueCandidates[0].id : null;

  const filteredHistory = data.transactions.filter((tx) => {
    const group = transactionGroup(tx.reason, tx.reservedDelta ?? 0);
    if (historyFilter === "all") return group !== "internal";
    return group === historyFilter;
  });
  const visibleTransactions = filteredHistory.slice(0, visibleHistory);
  const selectFilter = (filter: HistoryFilter) => {
    setHistoryFilter(filter);
    setVisibleHistory(HISTORY_LIMIT);
  };
  const filters: Array<{ id: HistoryFilter; label: string }> = [
    { id: "all", label: t("filterAll") },
    { id: "topups", label: t("filterTopUps") },
    { id: "usage", label: t("filterUsage") },
    { id: "adjustments", label: t("filterAdjustments") },
    { id: "internal", label: t("filterInternal") },
  ];

  const refreshOrder = async (orderId: string) => {
    if (syncingOrder) return;
    setOrderNotice(null);
    setSyncingOrder(orderId);
    try {
      const result = await creditsAdapter.syncOrder(orderId);
      if (result.ok && result.data.applied) {
        window.location.reload();
        return;
      }
      setOrderNotice(t("orderStillPending"));
    } finally {
      setSyncingOrder(null);
    }
  };

  return (
    <>
      <section
        id="wallet-overview"
        aria-labelledby="wallet-overview-title"
        className="mt-6 scroll-mt-28"
      >
        <h2 id="wallet-overview-title" className="sr-only">
          {t("balanceTitle")}
        </h2>
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-500/[0.09] via-white/[0.02] to-transparent p-6 md:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-400">
                {t("availableCredits")}
              </p>
              <p className="mt-2 text-5xl font-semibold tracking-tight text-white md:text-6xl">
                {available.toLocaleString(locale)}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-zinc-300">
                  {t("balanceTitle")}:{" "}
                  {data.wallet.credits.toLocaleString(locale)}
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-zinc-300">
                  {t("reservedCredits")}: {reserved.toLocaleString(locale)}
                </span>
              </div>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-zinc-400">
                {t("balanceHint")}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
              <p className="text-sm font-medium text-zinc-400">
                {t("estimatedGenerationsLabel")}
              </p>
              <p className="mt-1 text-4xl font-semibold tracking-tight text-white">
                {estimated ?? "—"}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                {price > 0
                  ? t("estimateBasis", { price })
                  : t("estimateUnavailable")}
              </p>
              <a
                href="#wallet-packages"
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
              >
                {t("checkoutButton")}
              </a>
            </div>
          </div>
        </div>
      </section>

      <section
        id="wallet-packages"
        aria-labelledby="wallet-packages-title"
        className="mt-10 scroll-mt-28"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="wallet-packages-title" className="text-xl font-semibold">
              {t("packagesTitle")}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {t("packagesSubtitle")}
            </p>
          </div>
          {price > 0 ? (
            <p className="text-sm text-zinc-500">
              {t("packagesEstimateHint", { price })}
            </p>
          ) : null}
        </div>
        {data.packages.length === 0 ? (
          <EmptyState
            className="mt-4"
            title={t("packagesEmptyTitle")}
            body={t("packagesEmptyBody")}
          />
        ) : (
          <>
            <ul className="mt-4 grid gap-4 md:grid-cols-3">
              {data.packages.map((pkg) => {
                const generations =
                  price > 0 ? Math.floor(pkg.credits / price) : null;
                const bestValue = pkg.id === bestValueId;
                return (
                  <li
                    key={pkg.id}
                    className={`flex flex-col rounded-2xl border p-5 ${
                      bestValue
                        ? "border-violet-400/40 bg-violet-500/[0.07]"
                        : "border-white/10 bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-zinc-200">
                        {pkg.label ?? pkg.id}
                      </p>
                      {bestValue ? (
                        <span className="shrink-0 rounded-full border border-violet-400/30 bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-200">
                          {t("bestValue")}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-4 text-3xl font-semibold tracking-tight text-white">
                      {t("packageCredits", { credits: pkg.credits })}
                    </p>
                    <p className="mt-1 text-lg text-zinc-200">
                      {money(pkg.priceMinorUnits, pkg.currency, locale)}
                    </p>
                    <dl className="mt-4 space-y-1.5 text-sm text-zinc-400">
                      {generations !== null ? (
                        <div className="flex items-center justify-between gap-3">
                          <dt>{t("estimatedGenerationsLabel")}</dt>
                          <dd className="font-medium text-zinc-200">
                            {generations}
                          </dd>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between gap-3">
                        <dt>{t("perCredit")}</dt>
                        <dd className="text-zinc-300">
                          {moneyPerCredit(
                            pkg.priceMinorUnits,
                            pkg.credits,
                            pkg.currency,
                            locale
                          )}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-auto pt-4">
                      {data.pricing.checkoutAvailable ? (
                        <Button
                          size="lg"
                          className="w-full"
                          onClick={() => void startCheckout(pkg)}
                          disabled={checkingOut !== null}
                        >
                          {checkingOut === pkg.id
                            ? t("checkoutRedirecting")
                            : t("checkoutButton")}
                        </Button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="min-h-11 w-full cursor-not-allowed rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-500"
                          title={t("checkoutBlockedBody")}
                        >
                          {t("checkoutButton")}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">
              {data.pricing.checkoutAvailable
                ? t("checkoutProviderNote")
                : t("checkoutBlockedBody")}
            </p>
            {checkoutError ? (
              <p role="alert" className="mt-2 text-sm text-amber-300">
                {checkoutError}
              </p>
            ) : null}
          </>
        )}
      </section>

      <section
        id="wallet-history"
        aria-labelledby="wallet-history-title"
        className="mt-12 scroll-mt-28"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="wallet-history-title" className="text-xl font-semibold">
              {t("transactionsTitle")}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {t("historySubtitle")}
            </p>
          </div>
          <p aria-live="polite" className="text-sm text-zinc-500">
            {t("showingCount", {
              shown: visibleTransactions.length,
              total: filteredHistory.length,
            })}
          </p>
        </div>

        <div
          className="mt-4 flex flex-wrap gap-2"
          role="group"
          aria-label={t("historyFilterAria")}
        >
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              aria-pressed={historyFilter === filter.id}
              onClick={() => selectFilter(filter.id)}
              className={`min-h-9 rounded-full border px-3.5 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 ${
                historyFilter === filter.id
                  ? "border-violet-400/50 bg-violet-500/15 text-violet-100"
                  : "border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/25 hover:text-zinc-200"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          {t("historyInternalNote")}
        </p>

        {filteredHistory.length === 0 ? (
          <EmptyState
            className="mt-4"
            title={t("historyEmptyFilter")}
            body={t("historyEmptyFilterBody")}
          />
        ) : (
          <>
            <ul className="mt-4 divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.02]">
              {visibleTransactions.map((tx) => {
                const group = transactionGroup(
                  tx.reason,
                  tx.reservedDelta ?? 0
                );
                const internal = group === "internal";
                const reservedDelta = tx.reservedDelta ?? 0;
                const amount = internal ? reservedDelta : tx.delta;
                const signed =
                  amount > 0 ? `+${amount}` : String(amount);
                return (
                  <li
                    key={tx.id}
                    className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-zinc-200">
                          {safeMessage(
                            `reason.${tx.reason}`,
                            tx.reason ?? "—"
                          )}
                        </span>
                        {internal ? (
                          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] font-medium text-zinc-400">
                            {t("internalBadge")}
                          </span>
                        ) : null}
                        {tx.reason === "generation.mock" ? (
                          <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
                            {t("noCharge")}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {new Date(tx.createdAt).toLocaleString(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                      {internal && reservedDelta !== 0 ? (
                        <p className="mt-1 text-xs text-zinc-500">
                          {reservedDelta > 0
                            ? t("reservationHeld")
                            : t("reservationReleased")}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-base font-semibold ${
                          internal
                            ? "text-zinc-400"
                            : amount > 0
                              ? "text-emerald-300"
                              : "text-zinc-100"
                        }`}
                      >
                        {internal && amount === 0 ? "0" : signed}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {internal
                          ? t("availableUnchanged")
                          : t("creditsUnit")}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {filteredHistory.length > visibleTransactions.length ? (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() =>
                    setVisibleHistory((count) => count + HISTORY_LIMIT)
                  }
                  className="min-h-11 rounded-full border border-white/15 bg-white/[0.03] px-6 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                >
                  {t("loadMore")}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section
        id="wallet-orders"
        aria-labelledby="wallet-orders-title"
        className="mt-12 scroll-mt-28"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="wallet-orders-title" className="text-xl font-semibold">
              {t("ordersTitle")}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {t("ordersSubtitle")}
            </p>
          </div>
          {orderNotice ? (
            <p role="status" className="text-sm text-zinc-400">
              {orderNotice}
            </p>
          ) : null}
        </div>
        {data.orders.length === 0 ? (
          <EmptyState
            className="mt-4"
            title={t("ordersEmptyTitle")}
            body={t("ordersEmptyBody")}
          />
        ) : (
          <div className="mt-4 space-y-3">
            {data.orders.map((order) => {
              const statusLabel = safeMessage(
                `orderStatus.${order.status ?? "pending"}`,
                order.status ?? "pending"
              );
              const tone =
                order.status === "paid"
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                  : order.status === "pending"
                    ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                    : order.status === "failed"
                      ? "border-red-400/30 bg-red-400/10 text-red-200"
                      : "border-white/15 bg-white/[0.03] text-zinc-300";
              return (
                <details
                  key={order.id}
                  className="group rounded-2xl border border-white/10 bg-white/[0.02]"
                >
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-violet-300 [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200">
                        {order.amountMinorUnits !== null && order.currency
                          ? money(
                              order.amountMinorUnits,
                              order.currency,
                              locale
                            )
                          : "—"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {new Date(order.createdAt).toLocaleDateString(locale)}
                        {" · "}
                        {order.packageId ?? "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}
                      >
                        {statusLabel}
                      </span>
                      <span
                        aria-hidden
                        className="text-zinc-500 transition group-open:rotate-180"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          className="h-4 w-4"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </span>
                    </div>
                  </summary>
                  <div className="border-t border-white/5 px-5 py-4">
                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-zinc-500">
                          {t("orderId")}
                        </dt>
                        <dd className="mt-0.5 break-all font-mono text-xs text-zinc-300">
                          {order.id}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-zinc-500">
                          {t("orderPackage")}
                        </dt>
                        <dd className="mt-0.5 text-zinc-300">
                          {order.packageId ?? "—"}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs text-zinc-500">
                          {t("orderCreated")}
                        </dt>
                        <dd className="mt-0.5 text-zinc-300">
                          {new Date(order.createdAt).toLocaleString(locale)}
                        </dd>
                      </div>
                    </dl>
                    {order.status === "pending" ? (
                      <div className="mt-4">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={syncingOrder === order.id}
                          onClick={() => void refreshOrder(order.id)}
                        >
                          {syncingOrder === order.id
                            ? t("loading")
                            : t("orderRefresh")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
