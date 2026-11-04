import { useEffect, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { trpc } from "../lib/trpc";

const SEEN_KEY = "kf-visitor-ads-seen";

function seenIds(): number[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SEEN_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(n => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}
function remember(id: number) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seenIds().filter(n => n !== id), id].slice(-50)));
  } catch {
    /* storage may be blocked; the ad simply shows again next time */
  }
}

/**
 * Popup ad for first-time visitors: "public" on the home and task-browsing pages,
 * "signup" on the create-account page.
 * Each browser sees each ad once; never shown to signed-in members or on
 * payment, task-submission or withdrawal screens.
 */
export default function VisitorAd({ placement = "public" }: { placement?: "public" | "signup" }) {
  const ad = trpc.announcements.visitorNext.useQuery({ placement }, { staleTime: 300_000, retry: false, refetchOnWindowFocus: false });
  const event = trpc.announcements.visitorEvent.useMutation();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const item = ad.data;

  // Wait briefly so the page loads first, then show only if this browser hasn't seen it.
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!ready || !item || seenIds().includes(item.id)) return;
    remember(item.id);
    setOpen(true);
    event.mutate({ id: item.id, kind: "seen" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, item?.id]);

  if (!item || !open) return null;
  const close = () => setOpen(false);
  return (
    <div className="modal-backdrop announce-backdrop" role="dialog" aria-modal="true" aria-labelledby="visitor-ad-title" onClick={close}>
      <div className="announce-card" onClick={e => e.stopPropagation()}>
        <button className="topbar-icon announce-close" onClick={close} aria-label="Close">
          <X size={16} />
        </button>
        {item.mediaUrl &&
          (item.mediaType === "video" ? (
            <video className="announce-media announce-video" src={item.mediaUrl} controls autoPlay muted playsInline preload="metadata" />
          ) : (
            <img className="announce-media" src={item.mediaUrl} alt="" />
          ))}
        <div className="announce-body">
          <p className="page-eyebrow">{item.sponsorName ? `Sponsored · ${item.sponsorName}` : "Sponsored"}</p>
          <h2 id="visitor-ad-title">{item.title}</h2>
          <p style={{ whiteSpace: "pre-line" }}>{item.body}</p>
          <div className="button-row">
            {item.linkUrl && (
              <a
                className="button-app"
                href={item.linkUrl}
                target="_blank"
                rel="noreferrer noopener sponsored"
                onClick={() => {
                  event.mutate({ id: item.id, kind: "clicked" });
                  close();
                }}
              >
                {item.linkLabel || "Learn more"} <ArrowUpRight size={14} />
              </a>
            )}
            <button className="button-app secondary" onClick={close}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
