"use client";

import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import type { PaidTier } from "@beast/shared";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function CheckoutButton({
  tier,
  label,
  disabled,
}: {
  tier: PaidTier;
  label: string;
  disabled: boolean;
}) {
  const trpc = useTRPC();
  const checkout = useMutation(
    trpc.billing.createCheckout.mutationOptions({
      onSuccess: ({ checkoutUrl }) => {
        if (checkoutUrl) window.location.href = checkoutUrl;
      },
    }),
  );

  return (
    <div className="shrink-0 text-right">
      <button
        onClick={() => checkout.mutate({ tier })}
        disabled={disabled || checkout.isPending}
        className={`btn-ink ${FOCUS} disabled:pointer-events-none disabled:opacity-50`}
      >
        {checkout.isPending ? "Opening checkout…" : label}
      </button>
      {checkout.error && (
        <p className="mt-1.5 text-[12.5px] text-state-failed">{checkout.error.message}</p>
      )}
    </div>
  );
}

export function PortalButton({ disabled }: { disabled: boolean }) {
  const trpc = useTRPC();
  const portal = useMutation(
    trpc.billing.createPortal.mutationOptions({
      onSuccess: ({ portalUrl }) => {
        if (portalUrl) window.location.href = portalUrl;
      },
    }),
  );

  return (
    <div>
      <button
        onClick={() => portal.mutate()}
        disabled={disabled || portal.isPending}
        className={`btn-ghost ${FOCUS} disabled:pointer-events-none disabled:opacity-50`}
      >
        {portal.isPending ? "Opening portal…" : "Manage subscription in Stripe"}
      </button>
      {portal.error && (
        <p className="mt-1.5 text-[12.5px] text-state-failed">{portal.error.message}</p>
      )}
    </div>
  );
}
