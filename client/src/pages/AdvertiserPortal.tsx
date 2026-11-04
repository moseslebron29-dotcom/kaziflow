import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  ArrowRight,
  BriefcaseBusiness,
  Eye,
  FileImage,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
  Users,
  WalletCards,
} from "lucide-react";
import { Wordmark } from "../components/Brand";
import { useTheme } from "../contexts/ThemeContext";
import { trpc } from "../lib/trpc";
import { formatKes } from "../lib/format";

type User = {
  id: number;
  name: string | null;
  email: string | null;
  accountType: string;
  role: string;
};
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Please try again.";
const b64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () =>
      reject(new Error("Could not read the selected media."));
    reader.readAsDataURL(file);
  });
const date = (v: unknown) => {
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-KE");
};

export default function AdvertiserPortal({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [location] = useLocation();
  const theme = useTheme();
  const utils = trpc.useUtils();
  const data = trpc.advertiser.overview.useQuery(undefined, { retry: false });
  const uploadImage = trpc.advertiser.uploadMedia.useMutation();
  const uploadVideo = trpc.advertiser.uploadVideo.useMutation();
  const create = trpc.advertiser.createCampaign.useMutation();
  const fund = trpc.advertiser.fundCampaign.useMutation();
  const [file, setFile] = useState<File | null>(null);
  const [mediaAssetId, setMediaAssetId] = useState<number | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "",
    advertiserName: user.name ?? "",
    description: "",
    instructions: "",
    rateKes: "1",
    minimumViews: "10",
    maximumPayableViews: "1000",
    budgetKes: "1000",
    participantLimit: "50",
    durationDays: "7",
    strictVerification: false,
  });
  const set = (key: string, value: string | boolean) =>
    setForm(current => ({ ...current, [key]: value }));
  const saveMedia = async () => {
    if (!file) throw new Error("Choose a campaign image or MP4 video first.");
    if (file.size > 8_000_000)
      throw new Error(
        "For this browser upload, keep a campaign file under 8 MB."
      );
    const data = await b64(file);
    const result =
      file.type === "video/mp4"
        ? await uploadVideo.mutateAsync({ mime: "video/mp4", base64: data })
        : await uploadImage.mutateAsync({
            mime: file.type as any,
            base64: data,
          });
    setMediaAssetId(result.assetId);
    setMediaType(file.type === "video/mp4" ? "video" : "image");
    return result.assetId;
  };
  const createCampaign = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const assetId = mediaAssetId ?? (await saveMedia());
      const result = await create.mutateAsync({
        title: form.title,
        advertiserName: form.advertiserName,
        description: form.description,
        instructions: form.instructions,
        mediaAssetId: assetId,
        mediaType,
        rateKes: Number(form.rateKes),
        minimumViews: Number(form.minimumViews),
        maximumPayableViews: Number(form.maximumPayableViews),
        budgetKes: Number(form.budgetKes),
        participantLimit: Number(form.participantLimit),
        durationDays: Number(form.durationDays),
        strictVerification: form.strictVerification,
      });
      toast.success(`${result.message} Reference ${result.reference}.`);
      setForm({ ...form, title: "", description: "", instructions: "" });
      setMediaAssetId(null);
      setFile(null);
      await utils.advertiser.overview.invalidate();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const fundCampaign = async (campaignId: number) => {
    const selectedPhone = window.prompt(
      "Enter the M-Pesa number for the campaign funding STK Push:",
      phone || "254"
    );
    if (!selectedPhone) return;
    setPhone(selectedPhone);
    try {
      const result = await fund.mutateAsync({
        campaignId,
        phone: selectedPhone,
      });
      toast.success(
        `${result.message} Campaign remains inactive until the provider confirms funding and an administrator approves it.`
      );
      await utils.advertiser.overview.invalidate();
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  const toggleTheme = () => theme.toggleTheme?.();
  const campaigns = data.data?.campaigns ?? [];
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Wordmark />
        <p className="sidebar-label">Advertiser workspace</p>
        <nav className="app-nav">
          <Link
            href="/advertiser"
            className={location === "/advertiser" ? "active" : ""}
          >
            <BriefcaseBusiness />
            <span>Overview</span>
          </Link>
          <Link
            href="/advertiser/campaigns"
            className={location === "/advertiser/campaigns" ? "active" : ""}
          >
            <Eye />
            <span>Campaigns & reports</span>
          </Link>
          <Link href="/support">
            <ShieldCheck />
            <span>Support centre</span>
          </Link>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-user">
          <div className="user-avatar">
            {(user.name ?? "A").slice(0, 1).toUpperCase()}
          </div>
          <span>
            <b>{user.name ?? "Advertiser"}</b>
            <small>Advertiser account</small>
          </span>
          <button className="topbar-icon" onClick={onLogout} title="Sign out">
            <LogOut size={15} />
          </button>
        </div>
      </aside>
      <div className="app-main">
        <div className="app-mobile-head">
          <Wordmark />
          <button
            className="topbar-icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            <Moon size={15} />
          </button>
        </div>
        <header className="app-topbar">
          <span className="app-topbar-title">
            Advertiser workspace / campaign ledger
          </span>
          <div className="app-topbar-actions">
            <span className="badge">
              {data.data?.darajaReady
                ? "Daraja configured"
                : "Funding setup required"}
            </span>
            <button
              className="topbar-icon"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              <Sun size={15} />
            </button>
          </div>
        </header>
        <main className="app-content">
          {data.isError && (
            <div className="notice">
              <ShieldCheck size={16} />
              <span>
                <strong>Advertiser service unavailable</strong>
                {data.error.message}
              </span>
            </div>
          )}
          <div className="page-intro">
            <div>
              <p className="page-eyebrow">Campaign ledger</p>
              <h1>
                {location === "/advertiser/campaigns"
                  ? "Campaigns & reporting."
                  : "Reach status audiences responsibly."}
              </h1>
              <p>
                Set a truthful brief, payment per eligible view, budget and
                audience limits. Funding and campaign approval are tracked
                separately.
              </p>
            </div>
            <a className="button-app secondary" href="#new-campaign">
              Create campaign <ArrowRight size={14} />
            </a>
          </div>
          <div className="dashboard-grid">
            <div className="metric-card">
              <div className="metric-label">
                Campaigns <BriefcaseBusiness size={14} />
              </div>
              <strong className="metric-value">{campaigns.length}</strong>
              <div className="metric-foot">Your submitted campaign records</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">
                Confirmed funding <WalletCards size={14} />
              </div>
              <strong className="metric-value">
                {formatKes(
                  campaigns.reduce((s: number, c: any) => s + c.fundedMinor, 0)
                )}
              </strong>
              <div className="metric-foot">Only confirmed Daraja receipts</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">
                Administrator-approved views <Eye size={14} />
              </div>
              <strong className="metric-value">
                {campaigns
                  .reduce((s: number, c: any) => s + c.approvedReportedViews, 0)
                  .toLocaleString()}
              </strong>
              <div className="metric-foot">
                Approved screenshot-reported views; not independent viewer
                verification
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">
                Campaign spend <WalletCards size={14} />
              </div>
              <strong className="metric-value">
                {formatKes(
                  campaigns.reduce(
                    (s: number, c: any) => s + c.amountSpentMinor,
                    0
                  )
                )}
              </strong>
              <div className="metric-foot">
                Member rewards credited after approval
              </div>
            </div>
          </div>
          {location === "/advertiser" && (
            <form
              className="surface surface-pad form-stack"
              id="new-campaign"
              onSubmit={createCampaign}
            >
              <div>
                <p className="page-eyebrow">Campaign setup</p>
                <h2 className="surface-title">Create a Status Ad campaign</h2>
                <p className="muted">
                  Campaigns remain inactive until their full budget is M-Pesa
                  funded and administrator-approved. Funds are never simulated.
                </p>
              </div>
              <div className="field-grid">
                <label className="field">
                  <span>Campaign title</span>
                  <input
                    className="input"
                    minLength={3}
                    maxLength={180}
                    required
                    value={form.title}
                    onChange={e => set("title", e.target.value)}
                    placeholder="Product or campaign name"
                  />
                </label>
                <label className="field">
                  <span>Advertiser name</span>
                  <input
                    className="input"
                    minLength={2}
                    maxLength={160}
                    required
                    value={form.advertiserName}
                    onChange={e => set("advertiserName", e.target.value)}
                  />
                </label>
                <label className="field full">
                  <span>Campaign description</span>
                  <textarea
                    className="textarea"
                    minLength={10}
                    maxLength={5000}
                    required
                    value={form.description}
                    onChange={e => set("description", e.target.value)}
                    placeholder="Describe the product, intended audience and any disclosures."
                  />
                </label>
                <label className="field full">
                  <span>Posting instructions</span>
                  <textarea
                    className="textarea"
                    minLength={10}
                    maxLength={5000}
                    required
                    value={form.instructions}
                    onChange={e => set("instructions", e.target.value)}
                    placeholder="Tell participants how to post the approved creative and what evidence to submit."
                  />
                </label>
                <label className="field full">
                  <span>Campaign image or MP4 video</span>
                  <input
                    className="input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4"
                    required
                    onChange={e => {
                      setFile(e.target.files?.[0] ?? null);
                      setMediaAssetId(null);
                    }}
                  />
                  <small>
                    {file
                      ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`
                      : "JPEG, PNG, WebP or MP4; upload limit 8 MB per browser request."}
                  </small>
                </label>
                <label className="field">
                  <span>Pay per eligible view (KES)</span>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="1000"
                    required
                    value={form.rateKes}
                    onChange={e => set("rateKes", e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Minimum eligible views</span>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="10000000"
                    required
                    value={form.minimumViews}
                    onChange={e => set("minimumViews", e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Maximum payable views per member</span>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="10000000"
                    required
                    value={form.maximumPayableViews}
                    onChange={e => set("maximumPayableViews", e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Total budget (KES)</span>
                  <input
                    className="input"
                    type="number"
                    min="100"
                    max="100000000"
                    required
                    value={form.budgetKes}
                    onChange={e => set("budgetKes", e.target.value)}
                  />
                  <small>
                    At least the platform-configured minimum; budget is the
                    maximum campaign spend.
                  </small>
                </label>
                <label className="field">
                  <span>Participant cap</span>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="100000"
                    required
                    value={form.participantLimit}
                    onChange={e => set("participantLimit", e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Campaign duration (days)</span>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="90"
                    required
                    value={form.durationDays}
                    onChange={e => set("durationDays", e.target.value)}
                  />
                </label>
                <label className="checkbox-row field full">
                  <input
                    type="checkbox"
                    checked={form.strictVerification}
                    onChange={e => set("strictVerification", e.target.checked)}
                  />{" "}
                  Request stricter evidence review. This does not imply
                  viewer-level WhatsApp verification.
                </label>
              </div>
              {error && <p className="form-error">{error}</p>}
              <button
                className="button-app"
                disabled={
                  create.isPending ||
                  uploadImage.isPending ||
                  uploadVideo.isPending
                }
              >
                {create.isPending ||
                uploadImage.isPending ||
                uploadVideo.isPending
                  ? "Uploading and saving…"
                  : "Save campaign for funding"}{" "}
                <ArrowRight size={14} />
              </button>
            </form>
          )}
          <section className="surface surface-pad" style={{ marginTop: 15 }}>
            <div className="section-line">
              <h2 className="surface-title">Your campaigns</h2>
              <span className="muted">{campaigns.length} record(s)</span>
            </div>
            {data.isLoading ? (
              <p className="muted">Loading campaigns…</p>
            ) : !campaigns.length ? (
              <div className="empty-state">
                <FileImage />
                <h3>No campaigns submitted</h3>
                <p>
                  Create a campaign, upload approved media and fund its budget
                  once the payment integration is configured.
                </p>
              </div>
            ) : (
              <div className="campaign-management-list">
                {campaigns.map((campaign: any) => (
                  <article
                    className="campaign-management-row"
                    key={campaign.id}
                  >
                    {campaign.mediaUrl && (
                      <div className="campaign-preview">
                        {campaign.mediaType === "video" ? (
                          <video
                            src={campaign.mediaUrl}
                            controls
                            preload="metadata"
                          />
                        ) : (
                          <img src={campaign.mediaUrl} alt="Campaign" />
                        )}
                      </div>
                    )}
                    <div className="campaign-management-info">
                      <div className="section-line">
                        <h3>{campaign.title}</h3>
                        <span className={`badge ${campaign.status}`}>
                          {campaign.status.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p>{campaign.description}</p>
                      <div className="campaign-meta">
                        <span>Ref {campaign.reference}</span>
                        <span>
                          {formatKes(campaign.rateMinor)} / eligible view
                        </span>
                        <span>Budget {formatKes(campaign.budgetMinor)}</span>
                        <span>Funded {formatKes(campaign.fundedMinor)}</span>
                        <span>Spent {formatKes(campaign.spentMinor)}</span>
                        <span>
                          {campaign.approvedReportedViews.toLocaleString()}{" "}
                          administrator-approved reported views
                        </span>
                        <span>
                          {campaign.participantCount} submitted participants
                        </span>
                      </div>
                      <p className="small-muted">
                        Evidence is screenshot-based and reviewed by an
                        administrator. Counts are not independent verification
                        of each viewer.
                      </p>
                      {campaign.status !== "active" &&
                        campaign.fundedMinor < campaign.budgetMinor && (
                          <div className="button-row">
                            <button
                              className="button-app"
                              disabled={
                                !data.data?.darajaReady || fund.isPending
                              }
                              onClick={() => void fundCampaign(campaign.id)}
                            >
                              {fund.isPending
                                ? "Requesting…"
                                : "Fund remaining budget with M-Pesa"}{" "}
                              <ArrowRight size={14} />
                            </button>
                            <span className="small-muted">
                              Full remaining balance:{" "}
                              {formatKes(
                                campaign.budgetMinor - campaign.fundedMinor
                              )}{" "}
                              · a provider-confirmed prompt is required.
                            </span>
                          </div>
                        )}
                      <CampaignParticipants campaignId={campaign.id} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          <div className="notice" style={{ marginTop: 14 }}>
            <ShieldCheck size={16} />
            <span>
              <strong>Funding and approval stay distinct</strong>An STK prompt
              is only a request. Funding is added after server-side Daraja
              confirmation; campaign activation requires full funding and
              administrator approval.
            </span>
          </div>
        </main>
      </div>
      <nav className="app-bottom-nav">
        <Link href="/advertiser">
          <BriefcaseBusiness />
          <span>Overview</span>
        </Link>
        <Link href="/advertiser/campaigns">
          <Eye />
          <span>Campaigns</span>
        </Link>
        <Link href="/support">
          <ShieldCheck />
          <span>Support</span>
        </Link>
      </nav>
    </div>
  );
}

function CampaignParticipants({ campaignId }: { campaignId: number }) {
  const participants = trpc.advertiser.participants.useQuery({ campaignId });
  if (participants.isLoading || !participants.data?.length) return null;
  return (
    <details className="participants-detail">
      <summary>
        <Users size={14} /> Participant evidence states (
        {participants.data.length})
      </summary>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Reported views</th>
              <th>Approved eligible views</th>
              <th>Reward</th>
              <th>Status</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>
            {participants.data.map((row: any) => (
              <tr key={row.id}>
                <td>{row.memberName}</td>
                <td>{row.reportedViews.toLocaleString()}</td>
                <td>{row.eligibleViews.toLocaleString()}</td>
                <td>{formatKes(row.rewardMinor)}</td>
                <td>
                  <span className={`badge ${row.status}`}>{row.status}</span>
                </td>
                <td>{new Date(row.submittedAt).toLocaleDateString("en-KE")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
