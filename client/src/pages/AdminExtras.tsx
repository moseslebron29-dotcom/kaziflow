import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Check, Eye, MousePointerClick, Pause, Play, Trash2, Upload } from "lucide-react";
import { trpc } from "../lib/trpc";
import { formatKes } from "../lib/format";

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Please try again.");
const when = (v: unknown) => {
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });
};
const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
const toLocalInput = (d: Date | string | null | undefined) => {
  if (!d) return "";
  const date = new Date(d);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function StatusBadge({ value }: { value: string }) {
  return <span className={`badge ${value.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`}>{value.replaceAll("_", " ")}</span>;
}

const audiences = [
  ["members", "All members"],
  ["activated", "Activated members"],
  ["not_activated", "Members not yet activated"],
  ["advertisers", "Advertisers"],
  ["all", "Everyone signed in"],
  ["visitors", "First-time website visitors (not signed in)"],
  ["signup", "People opening the create-account page (first time)"],
] as const;

export function AnnouncementsAdmin() {
  const list = trpc.announcements.adminList.useQuery();
  const utils = trpc.useUtils();
  const upload = trpc.announcements.uploadMedia.useMutation();
  const create = trpc.announcements.create.useMutation();
  const setStatus = trpc.announcements.setStatus.useMutation({ onSuccess: () => utils.announcements.adminList.invalidate() });
  const remove = trpc.announcements.delete.useMutation({ onSuccess: () => utils.announcements.adminList.invalidate() });
  const blank = { title: "", body: "", linkUrl: "", linkLabel: "", sponsorName: "", audience: "members", publishAt: toLocalInput(new Date()), expiresAt: "", status: "published" };
  const [form, setForm] = useState<Record<string, string>>(blank);
  const [file, setFile] = useState<File | null>(null);
  const put = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      let mediaAssetId: number | undefined;
      if (file) mediaAssetId = (await upload.mutateAsync({ mime: file.type as any, base64: await toBase64(file) })).assetId;
      await create.mutateAsync({
        title: form.title!,
        body: form.body!,
        linkUrl: form.linkUrl || null,
        linkLabel: form.linkLabel || null,
        sponsorName: form.sponsorName || null,
        audience: form.audience as any,
        publishAt: fromLocalInput(form.publishAt!),
        expiresAt: fromLocalInput(form.expiresAt!),
        status: form.status as any,
        mediaAssetId: mediaAssetId ?? null,
      });
      toast.success("Announcement saved.");
      setForm(blank);
      setFile(null);
      await utils.announcements.adminList.invalidate();
    } catch (error) {
      toast.error(messageOf(error));
    }
  };
  return (
    <>
      <form className="surface surface-pad form-stack" onSubmit={submit}>
        <h2 className="surface-title">New announcement or push ad</h2>
        <p className="small-muted">
          Members see it once as a popup on their dashboard after signing in. Choose "First-time website visitors" to show it once to people opening the home or
          tasks page for the first time. Never shown on payment, task or withdrawal screens.
        </p>
        <div className="field-grid">
          <label className="field">
            <span>Title</span>
            <input className="input" required minLength={3} maxLength={140} value={form.title} onChange={e => put("title", e.target.value)} />
          </label>
          <label className="field">
            <span>Target audience</span>
            <select className="select" value={form.audience} onChange={e => put("audience", e.target.value)}>
              {audiences.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="field full">
            <span>Description</span>
            <textarea className="textarea" required minLength={5} maxLength={2000} value={form.body} onChange={e => put("body", e.target.value)} />
          </label>
          <label className="field">
            <span>Image or video (optional)</span>
            <input className="input" type="file" accept="image/jpeg,image/png,image/webp,video/mp4" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            <small>Images up to 3 MB, MP4 video up to 8 MB.</small>
          </label>
          <label className="field">
            <span>Destination link (optional, https://)</span>
            <input className="input" type="url" value={form.linkUrl} onChange={e => put("linkUrl", e.target.value)} placeholder="https://" />
          </label>
          <label className="field">
            <span>Sponsor name (optional)</span>
            <input className="input" maxLength={120} value={form.sponsorName} onChange={e => put("sponsorName", e.target.value)} placeholder="Shown as Sponsored · name" />
          </label>
          <label className="field">
            <span>Button label</span>
            <input className="input" maxLength={40} value={form.linkLabel} onChange={e => put("linkLabel", e.target.value)} placeholder="Learn more" />
          </label>
          <label className="field">
            <span>Status</span>
            <select className="select" value={form.status} onChange={e => put("status", e.target.value)}>
              <option value="published">Publish</option>
              <option value="draft">Save as draft</option>
              <option value="paused">Paused</option>
            </select>
          </label>
          <label className="field">
            <span>Publish from</span>
            <input className="input" type="datetime-local" value={form.publishAt} onChange={e => put("publishAt", e.target.value)} />
          </label>
          <label className="field">
            <span>Expires (optional)</span>
            <input className="input" type="datetime-local" value={form.expiresAt} onChange={e => put("expiresAt", e.target.value)} />
          </label>
        </div>
        <button className="button-app" disabled={create.isPending || upload.isPending}>
          {upload.isPending ? "Uploading…" : create.isPending ? "Saving…" : "Save announcement"} <Upload size={14} />
        </button>
      </form>
      <section className="surface surface-pad" style={{ marginTop: 14 }}>
        <h2 className="surface-title">Announcements</h2>
        {!list.data?.length ? (
          <p className="muted">No announcements yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Announcement</th>
                  <th>Audience</th>
                  <th>Schedule</th>
                  <th>Status</th>
                  <th>Impressions</th>
                  <th>Clicks</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map(a => (
                  <tr key={a.id}>
                    <td>
                      <b>{a.title}</b>
                      <small className="table-subline">{a.body.slice(0, 90)}</small>
                      {a.mediaUrl && (
                        <a className="text-link" href={a.mediaUrl} target="_blank" rel="noreferrer">
                          View media
                        </a>
                      )}
                    </td>
                    <td>{audiences.find(x => x[0] === a.audience)?.[1]}</td>
                    <td>
                      {when(a.publishAt)}
                      <small className="table-subline">{a.expiresAt ? `until ${when(a.expiresAt)}` : "No expiry"}</small>
                    </td>
                    <td>
                      <StatusBadge value={a.status} />
                    </td>
                    <td>
                      <Eye size={13} /> {a.impressions.toLocaleString()}
                    </td>
                    <td>
                      <MousePointerClick size={13} /> {a.clicks.toLocaleString()} <small className="table-subline">{a.ctr}% CTR</small>
                    </td>
                    <td>
                      <div className="button-row">
                        {a.status === "published" ? (
                          <button className="button-app secondary" onClick={() => setStatus.mutate({ id: a.id, status: "paused" })}>
                            <Pause size={13} /> Pause
                          </button>
                        ) : (
                          <button className="button-app secondary" onClick={() => setStatus.mutate({ id: a.id, status: "published" })}>
                            <Play size={13} /> Publish
                          </button>
                        )}
                        <button
                          className="button-app danger"
                          onClick={() => {
                            if (window.confirm("Delete this announcement and its statistics?")) remove.mutate({ id: a.id });
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export function EmailsAdmin() {
  const log = trpc.admin.emailLog.useQuery();
  const utils = trpc.useUtils();
  const broadcast = trpc.admin.broadcastEmail.useMutation();
  const [form, setForm] = useState({ subject: "", body: "", audience: "all_members" });
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!window.confirm("Send this email now to every opted-in, verified account in the audience?")) return;
    try {
      const r = await broadcast.mutateAsync(form as any);
      toast.success(`Sent ${r.sent} of ${r.total}${r.failed ? ` (${r.failed} failed)` : ""}.`);
      setForm({ subject: "", body: "", audience: form.audience });
      await utils.admin.emailLog.invalidate();
    } catch (error) {
      toast.error(messageOf(error));
    }
  };
  return (
    <>
      <div className="notice">
        <Check size={16} />
        <span>
          <strong>Brevo email is {log.data?.ready ? "connected" : "not configured"}</strong>
          Verification codes, welcome, password reset, activation, task decision and withdrawal emails are sent automatically. Codes are never stored in this log.
        </span>
      </div>
      <form className="surface surface-pad form-stack" onSubmit={send} style={{ marginTop: 14 }}>
        <h2 className="surface-title">Send an important announcement email</h2>
        <div className="field-grid">
          <label className="field">
            <span>Subject</span>
            <input className="input" required minLength={4} maxLength={120} value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
          </label>
          <label className="field">
            <span>Audience</span>
            <select className="select" value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })}>
              <option value="all_members">All verified members</option>
              <option value="activated">Activated members</option>
              <option value="not_activated">Members not yet activated</option>
              <option value="advertisers">Advertisers</option>
            </select>
          </label>
          <label className="field full">
            <span>Message (blank line = new paragraph)</span>
            <textarea className="textarea" required minLength={10} maxLength={5000} rows={6} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
          </label>
        </div>
        <button className="button-app" disabled={broadcast.isPending || !log.data?.ready}>
          {broadcast.isPending ? "Sending…" : "Send email"}
        </button>
        <p className="small-muted">Only members who opted in to announcements receive it (max 1,000 per send).</p>
      </form>
      <section className="surface surface-pad" style={{ marginTop: 14 }}>
        <h2 className="surface-title">Delivery log</h2>
        {!log.data?.rows.length ? (
          <p className="muted">No emails yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Recipient</th>
                  <th>Subject</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {log.data.rows.map(r => (
                  <tr key={r.log.id}>
                    <td>{when(r.log.createdAt)}</td>
                    <td>{r.log.template.replaceAll("_", " ")}</td>
                    <td>{r.email ?? "—"}</td>
                    <td>{r.log.template.startsWith("otp") ? "Verification code email" : r.log.subject}</td>
                    <td>
                      <StatusBadge value={r.log.status} />
                      {r.log.errorText && <small className="table-subline">{r.log.errorText}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export function AdvertisersAdmin({ onSuspend }: { onSuspend: (userId: number, suspended: boolean) => void }) {
  const list = trpc.admin.advertisers.useQuery();
  return (
    <section className="surface surface-pad">
      {!list.data?.length ? (
        <p className="muted">No advertiser accounts yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Advertiser</th>
                <th>Business</th>
                <th>Email</th>
                <th>Campaigns</th>
                <th>Funded</th>
                <th>Spent</th>
                <th>Joined</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map(a => (
                <tr key={a.id}>
                  <td>
                    <b>{a.name}</b>
                    <small className="table-subline">{a.phone}</small>
                  </td>
                  <td>{a.businessName ?? "—"}</td>
                  <td>
                    {a.email}
                    <small className="table-subline">{a.emailVerifiedAt ? "Verified" : "Not verified"}</small>
                  </td>
                  <td>{a.campaigns}</td>
                  <td>{formatKes(a.fundedMinor)}</td>
                  <td>{formatKes(a.spentMinor)}</td>
                  <td>{when(a.createdAt)}</td>
                  <td>
                    <button className={`button-app ${a.suspendedAt ? "secondary" : "danger"}`} onClick={() => onSuspend(a.id, !a.suspendedAt)}>
                      {a.suspendedAt ? "Restore" : "Suspend"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export { toLocalInput, fromLocalInput };
