import { useEffect, useRef } from "react";
import { trpc } from "../lib/trpc";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * Google AdSense placeholder for public content pages only (homepage, policy
 * pages). Renders nothing until ADSENSE_CLIENT_ID and a matching
 * VITE_ADSENSE_SLOT_* value are configured. Never use this on task, wallet,
 * payment or other incentivized member pages.
 */
export function AdSlot({ slot }: { slot: "home-faq" | "policy" }) {
  const info = trpc.site.info.useQuery(undefined, { staleTime: 300_000, retry: false });
  const client = info.data?.adsenseClientId;
  const slotId = slot === "home-faq" ? import.meta.env.VITE_ADSENSE_SLOT_HOME : import.meta.env.VITE_ADSENSE_SLOT_POLICY;
  const ref = useRef<HTMLModElement>(null);
  useEffect(() => {
    if (!client || !slotId) return;
    if (!document.querySelector("script[data-kf-adsense]")) {
      const s = document.createElement("script");
      s.async = true;
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
      s.crossOrigin = "anonymous";
      s.dataset.kfAdsense = "1";
      document.head.appendChild(s);
    }
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* Ad blockers may prevent loading; the page works without ads. */
    }
  }, [client, slotId]);
  if (!client || !slotId) return null;
  return (
    <div className="ad-slot" aria-label="Advertisement">
      <span className="ad-slot-label">Advertisement</span>
      <ins ref={ref} className="adsbygoogle" style={{ display: "block" }} data-ad-client={client} data-ad-slot={slotId} data-ad-format="auto" data-full-width-responsive="true" />
    </div>
  );
}
