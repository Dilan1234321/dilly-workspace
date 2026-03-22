"use client";

import type { ReactNode } from "react";

/**
 * Renders feed sections in Dilly-priority order. Pass a map of id → node; `order` is the sorted id list
 * from `orderFeedCards` / `orderedFeedIds`.
 */
export function DillyFeed({ order, children }: { order: string[]; children: Record<string, ReactNode> }) {
  return (
    <>
      {order.map((id) => (
        <div key={id} data-feed-card-id={id}>
          {children[id] ?? null}
        </div>
      ))}
    </>
  );
}
