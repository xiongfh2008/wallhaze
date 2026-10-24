"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import EmptyState from "@/components/ui/EmptyState";
import { authAdapter } from "@/lib/api/auth";
import {
  CREDIT_WALLET_SERVICES_CONFIGURED,
  creditsAdapter,
  type PaymentOrder,
} from "@/lib/api/credits";

/**
 * Orders list (R06/R07). Reads the signed-in user's orders from the
 * backend; every value is provider-neutral (no PSP internals). Signed-out
 * visitors get the page's sign-in guidance instead.
 */
export default function OrdersPanel({ locale }: { locale: string }) {
  const t = useTranslations("account");
  const tWallet = useTranslations("wallet");
  const [state, setState] = useState<
    "hidden" | "loading" | "unavailable" | "ready" | "error"
  >(CREDIT_WALLET_SERVICES_CONFIGURED ? "loading" : "hidden");
  const [orders, setOrders] = useState<PaymentOrder[]>([]);

  useEffect(() => {
    if (!CREDIT_WALLET_SERVICES_CONFIGURED) return;
    let cancelled = false;
    void (async () => {
      const session = await authAdapter.getSession();
      if (cancelled) return;
      if (!session.ok) {
        setState("unavailable");
        return;
      }
      if (session.data === null) {
        setState("hidden");
        return;
      }
      const result = await creditsAdapter.listPaymentOrders();
      if (cancelled) return;
      if (!result.ok) {
        setState("error");
        return;
      }
      setOrders(result.data);
      setState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "hidden") return null;

  if (state === "loading") {
    return (
      <p className="mt-8 text-sm text-zinc-500" aria-busy>
        {t("ordersLoading")}
      </p>
    );
  }

  if (state === "unavailable" || state === "error") {
    return (
      <div
        role="status"
        className="mt-8 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-5 py-4 text-sm leading-relaxed text-amber-200"
      >
        {t("ordersUnavailableNotice")}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        className="mt-6"
        title={t("ordersEmptyTitle")}
        body={t("ordersEmptyBody")}
      />
    );
  }

  return (
    <ul className="mt-8 divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.02]">
      {orders.map((order) => (
        <li
          key={order.id}
          className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm"
        >
          <span className="font-mono text-xs text-zinc-400">
            {order.id.slice(0, 8)}
          </span>
          <span className="text-zinc-300">
            {order.amountMinorUnits !== null && order.currency
              ? new Intl.NumberFormat(locale, {
                  style: "currency",
                  currency: order.currency,
                }).format(order.amountMinorUnits / 100)
              : "—"}
          </span>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-zinc-400">
            {tWallet(`orderStatus.${order.status ?? "pending"}` as never)}
          </span>
        </li>
      ))}
    </ul>
  );
}
