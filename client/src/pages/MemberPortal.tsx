import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BadgeCheck,
  Bell,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Eye,
  FileCheck2,
  FileImage,
  HandCoins,
  History,
  Home,
  LogOut,
  Moon,
  Plus,
  ShieldCheck,
  Sun,
  Upload,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { Wordmark } from "../components/Brand";
import { trpc } from "../lib/trpc";
import { formatKes } from "../lib/format";

type User = {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  county: string | null;
  mpesaPhone: string | null;
  accountType: string;
  role: string;
  activatedAt?: Date | null;
  referralCode: string | null;
  emailVerifiedAt?: Date | null;
};
const categories = [
  { key: "all", label: "All tasks" },
  { key: "survey", label: "Surveys" },
  { key: "video", label: "Video" },
  { key: "social", label: "Social" },
  { key: "website", label: "Web visits" },
  { key: "microtask", label: "Microtasks" },
  { key: "chat", label: "Chat & earn" },
  { key: "writing", label: "Writing" },
  { key: "daily", label: "Daily" },
  { key: "promotion", label: "Promotions" },
] as const;
const navItems = [
  { href: "/dashboard", label: "Overview", icon: Home },
  { href: "/tasks", label: "Available tasks", icon: BriefcaseBusiness },
  { href: "/whatsapp-ads", label: "WhatsApp Status Ads", icon: Eye },
  { href: "/submissions", label: "My submissions", icon: FileCheck2 },
  { href: "/wallet", label: "Wallet & earnings", icon: WalletCards },
  { href: "/withdraw", label: "Withdraw", icon: ArrowDownToLine },
  { href: "/referrals", label: "Referrals", icon: Users },
  { href: "/history", label: "Transaction history", icon: History },
  { href: "/reviews", label: "Member review", icon: BadgeCheck },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/support", label: "Support", icon: CircleHelp },
];
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Please try again.";
const formatDate = (value: unknown) => {
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-KE", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
};
const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () =>
      reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });

export default function MemberPortal({
  user,
  onLogout,
  onToggleTheme,
}: {
  user: User;
  onLogout: () => void;
  onToggleTheme: () => void;
}) {
  const [location, setLocation] = useLocation();
  const path = location.split("?")[0] || "/dashboard";
  const me = trpc.auth.me.useQuery();
  const wallet = trpc.member.wallet.useQuery(undefined, { retry: false });
  const tasks = trpc.member.tasks.useQuery(undefined, { retry: false });
  const appStatus = trpc.auth.status.useQuery();
  const isActive = Boolean(me.data?.activatedAt ?? user.activatedAt);
  const titleMap: Record<string, string> = {
    "/dashboard": "Your work ledger",
    "/tasks": "Available tasks",
    "/whatsapp-ads": "WhatsApp Status Ads",
    "/submissions": "My submissions",
    "/earnings": "Earnings",
    "/wallet": "Wallet & earnings",
    "/withdraw": "Withdraw to M-Pesa",
    "/referrals": "Referral activity",
    "/history": "Transaction history",
    "/profile": "Account profile",
    "/support": "Support centre",
    "/activate": "Account activation",
    "/reviews": "Member review",
  };
  const currentTitle = titleMap[path] ?? "KaziFlow";
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Wordmark />
        <p className="sidebar-label">Member workspace</p>
        <nav className="app-nav">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={
                path === href || (href === "/wallet" && path === "/earnings")
                  ? "active"
                  : ""
              }
            >
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <Link href="/task-guidelines" className="app-nav-link">
          <ShieldCheck size={16} /> Task guidelines
        </Link>
        <div className="sidebar-user">
          <div className="user-avatar">
            {(user.name ?? "K").slice(0, 1).toUpperCase()}
          </div>
          <span>
            <b>{user.name ?? "Member"}</b>
            <small>
              {isActive ? "Activated member" : "Activation required"}
            </small>
          </span>
          <button className="topbar-icon" title="Sign out" onClick={onLogout}>
            <LogOut size={15} />
          </button>
        </div>
      </aside>
      <div className="app-main">
        <div className="app-mobile-head">
          <Wordmark />
          <div className="button-row">
            <button
              className="topbar-icon"
              onClick={onToggleTheme}
              aria-label="Toggle theme"
            >
              <Moon size={15} />
            </button>
            <button
              className="topbar-icon"
              onClick={onLogout}
              aria-label="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
        <header className="app-topbar">
          <span className="app-topbar-title">
            Member workspace / {currentTitle}
          </span>
          <div className="app-topbar-actions">
            <span className={`badge ${isActive ? "active" : "pending"}`}>
              {isActive ? "Activated" : "Activation needed"}
            </span>
            <button
              className="topbar-icon"
              onClick={onToggleTheme}
              aria-label="Toggle light or dark mode"
            >
              <Sun size={15} />
            </button>
          </div>
        </header>
        <main className="app-content">
          {appStatus.data?.announcement && (
            <div className="announcement">
              <Bell size={14} style={{ display: "inline", marginRight: 7 }} />
              {appStatus.data.announcement}
            </div>
          )}
          {path === "/dashboard" && (
            <Dashboard
              user={user}
              wallet={wallet.data}
              tasks={tasks.data ?? []}
              isActive={isActive}
            />
          )}
          {path === "/tasks" && <TaskBoard isActive={isActive} />}
          {path === "/whatsapp-ads" && <WhatsAppAds isActive={isActive} />}
          {path === "/submissions" && <Submissions />}
          {(path === "/wallet" || path === "/earnings") && (
            <WalletPage wallet={wallet.data} isActive={isActive} />
          )}
          {path === "/withdraw" && (
            <WithdrawPage
              user={user}
              wallet={wallet.data}
              isActive={isActive}
            />
          )}
          {path === "/referrals" && <Referrals />}
          {path === "/history" && <HistoryPage />}
          {path === "/profile" && <Profile user={me.data ?? user} />}
          {path === "/support" && <SupportPage />}
          {path === "/activate" && (
            <ActivationPage isActive={isActive} user={me.data ?? user} />
          )}
          {path === "/reviews" && <MemberReview />}
          {!titleMap[path] && (
            <div className="empty-state">
              <CircleHelp />
              <h3>Choose a workspace section</h3>
              <Link href="/dashboard">Return to your dashboard</Link>
            </div>
          )}
        </main>
      </div>
      <nav className="app-bottom-nav" aria-label="Member navigation">
        {navItems
          .filter(item =>
            [
              "/dashboard",
              "/tasks",
              "/whatsapp-ads",
              "/wallet",
              "/profile",
            ].includes(item.href)
          )
          .map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={path === href ? "active" : ""}
            >
              <Icon />
              <span>
                {href === "/whatsapp-ads"
                  ? "Status ads"
                  : href === "/dashboard"
                    ? "Home"
                    : href === "/wallet"
                      ? "Wallet"
                      : label}
              </span>
            </Link>
          ))}
      </nav>
    </div>
  );
}

function Intro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-intro">
      <div>
        <p className="page-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function Metric({
  label,
  value,
  foot,
  icon: Icon,
}: {
  label: string;
  value: string;
  foot?: string;
  icon?: any;
}) {
  return (
    <div className="metric-card">
      <div className="metric-label">
        <span>{label}</span>
        {Icon && <Icon size={14} />}
      </div>
      <strong className="metric-value">{value}</strong>
      {foot && <div className="metric-foot">{foot}</div>}
    </div>
  );
}
function Badge({ value }: { value: string }) {
  return (
    <span
      className={`badge ${value.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
function Empty({
  title,
  text,
  href,
  link,
}: {
  title: string;
  text: string;
  href?: string;
  link?: string;
}) {
  return (
    <div className="empty-state">
      <FileCheck2 size={25} />
      <h3>{title}</h3>
      <p>{text}</p>
      {href && (
        <Link
          className="button-app secondary"
          href={href}
          style={{ marginTop: 14 }}
        >
          {link ?? "Explore"}
        </Link>
      )}
    </div>
  );
}
function ActivationPrompt({ isActive }: { isActive: boolean }) {
  return !isActive ? (
    <div className="notice">
      <ShieldCheck size={17} />
      <span>
        <strong>Activate once before starting a task</strong>Pay the displayed
        fee through a Safaricom Daraja M-Pesa prompt. Your account activates
        only after provider verification.
        <Link href="/activate" className="notice-link">
          {" "}
          Review activation steps
        </Link>
      </span>
    </div>
  ) : null;
}

function Dashboard({
  user,
  wallet,
  tasks,
  isActive,
}: {
  user: User;
  wallet: any;
  tasks: any[];
  isActive: boolean;
}) {
  const submissions = trpc.member.mySubmissions.useQuery();
  const ads = trpc.member.whatsappCampaigns.useQuery(undefined, {
    enabled: isActive,
  });
  return (
    <>
      <Intro
        eyebrow="Account overview"
        title={`Good to see you, ${(user.name ?? "member").split(" ")[0]}.`}
        description="Your task activity and wallet balances are shown from the records attached to your account."
        action={
          <Link href="/tasks" className="button-app">
            Browse work <ArrowRight size={15} />
          </Link>
        }
      />
      <ActivationPrompt isActive={isActive} />
      <div className="dashboard-grid">
        <Metric
          label="Available balance"
          value={formatKes(wallet?.availableMinor ?? 0)}
          foot="Ready for eligible withdrawal"
          icon={WalletCards}
        />
        <Metric
          label="Pending earnings"
          value={formatKes(wallet?.pendingMinor ?? 0)}
          foot="Awaiting review"
          icon={Clock3}
        />
        <Metric
          label="Lifetime earnings"
          value={formatKes(wallet?.lifetimeMinor ?? 0)}
          foot="Approved credits only"
          icon={HandCoins}
        />
        <Metric
          label="Referral earnings"
          value={formatKes(wallet?.referralEarningsMinor ?? 0)}
          foot="Commission credits already earned"
          icon={Users}
        />
        <Metric
          label="Completed tasks"
          value={String(wallet?.completedTasks ?? 0)}
          foot="Approved tasks and campaign evidence"
          icon={Check}
        />
        <Metric
          label="Pending submissions"
          value={String(wallet?.pendingSubmissions ?? 0)}
          foot="Waiting for administrator review"
          icon={FileCheck2}
        />
        <Metric
          label="Active task listings"
          value={String(tasks.length)}
          foot="Availability may change"
          icon={BriefcaseBusiness}
        />
        <Metric
          label="Account status"
          value={isActive ? "Activated" : "Not activated"}
          foot={
            isActive ? "Provider-confirmed fee" : "KES 100 one-time activation"
          }
          icon={ShieldCheck}
        />
      </div>
      <div className="split-grid">
        <section className="surface surface-pad">
          <h2 className="surface-title">Pick up where you left off</h2>
          <div className="quick-links">
            <Link className="quick-link" href="/tasks">
              <BriefcaseBusiness /> Browse task categories{" "}
              <ChevronRight size={14} />
            </Link>
            <Link className="quick-link" href="/whatsapp-ads">
              <Eye /> WhatsApp Status Ads <ChevronRight size={14} />
            </Link>
            <Link className="quick-link" href="/submissions">
              <FileCheck2 /> Track submissions <ChevronRight size={14} />
            </Link>
            <Link className="quick-link" href="/withdraw">
              <ArrowDownToLine /> Request withdrawal <ChevronRight size={14} />
            </Link>
          </div>
        </section>
        <section className="surface surface-pad">
          <h2 className="surface-title">Recent activity</h2>
          {(wallet?.recentTransactions?.length ?? 0) > 0 ? (
            <div className="activity-list">
              {wallet.recentTransactions.slice(0, 4).map((row: any) => (
                <div className="activity-row" key={row.id}>
                  <span>
                    <b>{row.note ?? row.kind.replaceAll("_", " ")}</b>
                    <small>{formatDate(row.createdAt)}</small>
                  </span>
                  <strong>
                    {row.direction === "credit" ? "+" : "−"}
                    {formatKes(row.amountMinor)}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              Your confirmed transactions will appear here. No sample balance or
              payment has been added.
            </p>
          )}
          <Link className="text-link" href="/history">
            See transaction history <ArrowRight size={14} />
          </Link>
        </section>
      </div>
      <div className="split-grid" style={{ marginTop: 14 }}>
        <section className="surface surface-pad">
          <h2 className="surface-title">Submission pulse</h2>
          <div className="inline-stats">
            <span>
              <b>{submissions.data?.tasks?.length ?? 0}</b>
              <small>task submissions</small>
            </span>
            <span>
              <b>{submissions.data?.whatsappAds?.length ?? 0}</b>
              <small>ad submissions</small>
            </span>
            <span>
              <b>{ads.data?.campaigns?.length ?? 0}</b>
              <small>available ads</small>
            </span>
          </div>
          <Link className="text-link" href="/submissions">
            Open submissions <ArrowRight size={14} />
          </Link>
        </section>
        <section className="surface surface-pad">
          <h2 className="surface-title">Clear evidence, fair review</h2>
          <p className="muted">
            Member-submitted WhatsApp screenshots are reviewed by an
            administrator; they do not independently verify each viewer. Your
            pending reward only becomes available after approval.
          </p>
          <Link className="text-link" href="/advertising-guidelines">
            Read how reviews work <ArrowRight size={14} />
          </Link>
        </section>
      </div>
    </>
  );
}

type TaskRow = {
  id: number;
  category: string;
  title: string;
  description: string;
  instructions: string;
  completionRequirements: string;
  rewardMinor: number;
  estimatedMinutes: number;
  slotLimit: number;
  slotsTaken: number;
  completionMode: string;
  externalUrl: string | null;
  status: string;
  budgetMinor: number;
  spentMinor: number;
};
function TaskBoard({ isActive }: { isActive: boolean }) {
  const [category, setCategory] = useState("all");
  const [attempt, setAttempt] = useState<any>(null);
  const query = trpc.member.tasks.useQuery(
    category === "all" ? undefined : { category: category as any }
  );
  const start = trpc.member.startTask.useMutation();
  const submit = trpc.member.submitTask.useMutation();
  const upload = trpc.member.uploadEvidence.useMutation();
  const utils = trpc.useUtils();
  const [proof, setProof] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!attempt) return;
    const timer = setInterval(
      () =>
        setElapsed(
          Math.floor(
            (Date.now() - new Date(attempt.startedAt).getTime()) / 1000
          )
        ),
      1000
    );
    return () => clearInterval(timer);
  }, [attempt]);
  const begin = async (task: TaskRow) => {
    if (!isActive) {
      toast.info("Complete activation before starting a task.");
      window.history.pushState({}, "", "/activate");
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }
    try {
      const result = await start.mutateAsync({ taskId: task.id });
      if (result.needsActivation) {
        window.history.pushState({}, "", "/activate");
        window.dispatchEvent(new PopStateEvent("popstate"));
        return;
      }
      setAttempt({
        task: result.task,
        attemptId: result.attemptId,
        startedAt: result.startedAt,
      });
      setProof("");
      setEvidence(null);
      setElapsed(0);
    } catch (error) {
      toast.error(errorText(error));
    }
  };
  const submitTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!attempt) return;
    try {
      let evidenceAssetId: number | undefined;
      if (evidence)
        evidenceAssetId = (
          await upload.mutateAsync({
            mime: evidence.type as any,
            base64: await toBase64(evidence),
          })
        ).assetId;
      await submit.mutateAsync({
        taskId: attempt.task.id,
        attemptId: attempt.attemptId,
        proofText: proof,
        evidenceAssetId,
      });
      toast.success("Task submitted for review.");
      setAttempt(null);
      await Promise.all([
        utils.member.mySubmissions.invalidate(),
        utils.member.wallet.invalidate(),
        utils.member.tasks.invalidate(),
      ]);
    } catch (error) {
      toast.error(errorText(error));
    }
  };
  const remaining = attempt
    ? Math.max(0, attempt.task.estimatedMinutes * 60 - elapsed)
    : 0;
  return (
    <>
      <Intro
        eyebrow="Find a clear brief"
        title="Choose your next task."
        description="Every listing shows its work, time estimate, review requirements, reward and remaining slots."
      />
      <ActivationPrompt isActive={isActive} />
      <div className="filter-row" style={{ marginTop: 15 }}>
        {categories.map(item => (
          <button
            type="button"
            className={`filter-pill ${category === item.key ? "active" : ""}`}
            key={item.key}
            onClick={() => setCategory(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {query.isLoading ? (
        <p className="muted">Loading available tasks…</p>
      ) : (query.data?.length ?? 0) === 0 ? (
        <Empty
          title="No matching tasks right now"
          text="Task availability is set by administrators. Check again later or browse the other categories."
          href="/whatsapp-ads"
          link="Browse WhatsApp Status Ads"
        />
      ) : (
        <div className="task-grid">
          {(query.data as TaskRow[]).map(task => (
            <article className="task-card" key={task.id}>
              <div className="task-meta">
                <span className="badge">
                  {task.category.replaceAll("_", " ")}
                </span>
                <Badge value={task.status} />
              </div>
              <h3>{task.title}</h3>
              <p>{task.description}</p>
              <div className="task-meta">
                <span>
                  <Clock3 size={13} /> {task.estimatedMinutes} min
                </span>
                <span>
                  <Users size={13} />{" "}
                  {Math.max(0, task.slotLimit - task.slotsTaken)} slots
                </span>
                <span>
                  <FileCheck2 size={13} />{" "}
                  {task.completionMode.replaceAll("_", " ")}
                </span>
              </div>
              <div className="task-requirements">
                <b>Completion requirements</b>
                <p>{task.completionRequirements}</p>
              </div>
              <div className="task-card-foot">
                <strong className="task-reward">
                  {formatKes(task.rewardMinor)}
                </strong>
                <button
                  className="button-app"
                  disabled={
                    start.isPending ||
                    task.slotsTaken >= task.slotLimit ||
                    task.budgetMinor - task.spentMinor < task.rewardMinor
                  }
                  onClick={() => void begin(task)}
                >
                  {isActive ? "Start task" : "Activate to start"}{" "}
                  <ArrowRight size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {attempt && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-head">
              <div>
                <p className="page-eyebrow">Task {attempt.task.category}</p>
                <h2>{attempt.task.title}</h2>
                <p>
                  Follow the instructions and submit original, relevant proof.
                </p>
              </div>
              <button
                className="topbar-icon"
                onClick={() => setAttempt(null)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="notice">
              <Clock3 size={16} />
              <span>
                <strong>
                  Minimum activity time: {attempt.task.estimatedMinutes} minutes
                </strong>
                Time recorded since you started: {Math.floor(elapsed / 60)} min{" "}
                {elapsed % 60} sec. The server checks elapsed time; it does not
                independently verify external platform actions.
              </span>
            </div>
            {attempt.task.externalUrl && (
              <a
                className="button-app secondary"
                target="_blank"
                rel="noreferrer"
                href={attempt.task.externalUrl}
                style={{ marginTop: 14 }}
              >
                Open task destination <ArrowRight size={14} />
              </a>
            )}
            <div className="surface surface-pad" style={{ marginTop: 14 }}>
              <b>Instructions</b>
              <p className="muted">{attempt.task.instructions}</p>
            </div>
            <form
              className="form-stack"
              onSubmit={submitTask}
              style={{ marginTop: 14 }}
            >
              <label className="field">
                <span>What did you complete? Add the requested proof.</span>
                <textarea
                  className="textarea"
                  required
                  minLength={3}
                  maxLength={5000}
                  value={proof}
                  onChange={e => setProof(e.target.value)}
                  placeholder="Describe the completed task or enter the requested reference…"
                />
              </label>
              <label className="field">
                <span>Evidence image (optional)</span>
                <input
                  className="input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={e => setEvidence(e.target.files?.[0] ?? null)}
                />
                <small>
                  JPEG, PNG or WebP. Only submit evidence requested by the task.
                </small>
              </label>
              <button
                className="button-app"
                disabled={remaining > 0 || submit.isPending || upload.isPending}
              >
                {remaining > 0
                  ? `Available in ${Math.ceil(remaining / 60)} minute(s)`
                  : submit.isPending || upload.isPending
                    ? "Submitting…"
                    : "Submit for review"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

type Campaign = {
  id: number;
  reference: string;
  advertiserName: string;
  title: string;
  description: string;
  instructions: string;
  mediaUrl: string | null;
  mediaType: string;
  rateMinor: number;
  minimumViews: number;
  maximumPayableViews: number;
  budgetMinor: number;
  fundedMinor: number;
  spentMinor: number;
  participantLimit: number;
  participants: number;
  activeAt: Date | string | null;
  durationDays: number;
  strictVerification: boolean;
  evidenceNotice: string;
};
function WhatsAppAds({ isActive }: { isActive: boolean }) {
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [statusImage, setStatusImage] = useState<File | null>(null);
  const [insightsImage, setInsightsImage] = useState<File | null>(null);
  const [views, setViews] = useState("");
  const [postedAt, setPostedAt] = useState(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16)
  );
  const [reference, setReference] = useState("");
  const campaigns = trpc.member.whatsappCampaigns.useQuery(undefined, {
    enabled: isActive,
  });
  const upload = trpc.member.uploadEvidence.useMutation();
  const submit = trpc.member.submitWhatsappAd.useMutation();
  const utils = trpc.useUtils();
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !statusImage || !insightsImage) {
      toast.error("Upload both the status and the insights screenshot.");
      return;
    }
    try {
      const [status, insights] = await Promise.all([
        upload.mutateAsync({
          mime: statusImage.type as any,
          base64: await toBase64(statusImage),
        }),
        upload.mutateAsync({
          mime: insightsImage.type as any,
          base64: await toBase64(insightsImage),
        }),
      ]);
      await submit.mutateAsync({
        campaignId: selected.id,
        campaignReference: reference,
        postedAt: new Date(postedAt).toISOString(),
        reportedViews: Number(views),
        statusScreenshotAssetId: status.assetId,
        insightsScreenshotAssetId: insights.assetId,
      });
      toast.success("Evidence sent to the administrator review queue.");
      setSelected(null);
      setStatusImage(null);
      setInsightsImage(null);
      setViews("");
      await Promise.all([
        utils.member.mySubmissions.invalidate(),
        utils.member.wallet.invalidate(),
        utils.member.whatsappCampaigns.invalidate(),
      ]);
    } catch (error) {
      toast.error(errorText(error));
    }
  };
  const openCampaign = (campaign: Campaign) => {
    setSelected(campaign);
    setReference(campaign.reference);
    setPostedAt(
      new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16)
    );
  };
  return (
    <>
      <Intro
        eyebrow="A major member earning channel"
        title="WhatsApp Status Ads."
        description="Review campaign terms, post the approved media to your status, then submit both screenshots. An administrator reviews your claim before any eligible reward is credited."
      />
      {!isActive && (
        <div className="notice">
          <ShieldCheck size={17} />
          <span>
            <strong>Activation is required to join campaigns</strong>Browse
            public guidance now; activate once to access member campaign slots.
            <Link className="notice-link" href="/activate">
              {" "}
              Open activation
            </Link>
          </span>
        </div>
      )}
      <div className="notice evidence-notice" style={{ marginTop: 14 }}>
        <Eye size={17} />
        <span>
          <strong>Honest view verification</strong>Views are reported by members
          with screenshot evidence. Screenshots are reviewed but do not
          independently verify each viewer. Advertisers may require stricter
          checks.
        </span>
      </div>
      {campaigns.isLoading && isActive ? (
        <p className="muted">Loading funded campaigns…</p>
      ) : (campaigns.data?.campaigns?.length ?? 0) === 0 ? (
        <Empty
          title="No active funded campaigns"
          text="Campaigns appear after advertiser funding is provider-confirmed, administrators approve them and campaign limits remain available."
          href="/advertiser/campaigns"
          link="Are you an advertiser?"
        />
      ) : (
        <div className="campaign-grid">
          {(campaigns.data?.campaigns as Campaign[]).map(campaign => (
            <article className="campaign-card surface" key={campaign.id}>
              {campaign.mediaUrl &&
                (campaign.mediaType === "video" ? (
                  <video
                    className="campaign-media"
                    controls
                    preload="metadata"
                    src={campaign.mediaUrl}
                  />
                ) : (
                  <img
                    className="campaign-media"
                    src={campaign.mediaUrl}
                    alt={`${campaign.advertiserName} campaign creative`}
                  />
                ))}
              <div className="campaign-body">
                <div className="campaign-flag">
                  <span className="badge active">Funded · live</span>
                  <span className="muted">{campaign.reference}</span>
                </div>
                <h2>{campaign.title}</h2>
                <p className="muted">{campaign.description}</p>
                <div className="campaign-stats">
                  <span>
                    <small>Rate / eligible view</small>
                    <b>{formatKes(campaign.rateMinor)}</b>
                  </span>
                  <span>
                    <small>Minimum views</small>
                    <b>{campaign.minimumViews.toLocaleString()}</b>
                  </span>
                  <span>
                    <small>Payable cap</small>
                    <b>{campaign.maximumPayableViews.toLocaleString()}</b>
                  </span>
                </div>
                <div className="campaign-meta">
                  <span>{campaign.durationDays} day(s)</span>
                  <span>
                    {Math.max(
                      0,
                      campaign.participantLimit - campaign.participants
                    )}{" "}
                    participant slots
                  </span>
                  <span>
                    {campaign.strictVerification
                      ? "Stricter evidence"
                      : "Admin evidence review"}
                  </span>
                </div>
                <p className="evidence-notice">
                  <Eye size={14} /> {campaign.evidenceNotice}
                </p>
                {campaign.mediaUrl && (
                  <a
                    className="text-link"
                    href={campaign.mediaUrl}
                    target="_blank"
                    rel="noreferrer"
                    download
                  >
                    Open or download campaign media{" "}
                    <ArrowDownToLine size={14} />
                  </a>
                )}
                <button
                  className="button-app"
                  disabled={
                    !isActive ||
                    campaign.participants >= campaign.participantLimit
                  }
                  onClick={() => openCampaign(campaign)}
                >
                  Post & submit evidence <ArrowRight size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {selected && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-head">
              <div>
                <p className="page-eyebrow">Campaign {selected.reference}</p>
                <h2>Submit Status evidence</h2>
                <p>
                  {selected.advertiserName} · {selected.title} ·{" "}
                  {formatKes(selected.rateMinor)} / eligible view
                </p>
              </div>
              <button
                className="topbar-icon"
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="surface surface-pad">
              <b>Posting instructions</b>
              <p className="muted">{selected.instructions}</p>
              <p className="small-muted">
                Maximum payable views:{" "}
                {selected.maximumPayableViews.toLocaleString()} · Minimum:{" "}
                {selected.minimumViews.toLocaleString()}. Campaign material must
                not be edited.
              </p>
            </div>
            <form
              className="form-stack"
              onSubmit={onSubmit}
              style={{ marginTop: 14 }}
            >
              <div className="field-grid">
                <label className="field">
                  <span>Campaign reference</span>
                  <input
                    className="input"
                    required
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Date/time status posted</span>
                  <input
                    className="input"
                    type="datetime-local"
                    required
                    value={postedAt}
                    onChange={e => setPostedAt(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Self-reported status views</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max="10000000"
                    required
                    value={views}
                    onChange={e => setViews(e.target.value)}
                  />
                  <small>
                    Reported views are administrator-reviewed, not independently
                    confirmed.
                  </small>
                </label>
                <label className="field">
                  <span>Status screenshot</span>
                  <input
                    className="input"
                    required
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={e => setStatusImage(e.target.files?.[0] ?? null)}
                  />
                </label>
                <label className="field full">
                  <span>Insights/views screenshot</span>
                  <input
                    className="input"
                    required
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={e =>
                      setInsightsImage(e.target.files?.[0] ?? null)
                    }
                  />
                  <small>
                    Evidence must be original and member-uploaded. Reused images
                    are rejected.
                  </small>
                </label>
              </div>
              <button
                className="button-app"
                disabled={submit.isPending || upload.isPending}
              >
                {submit.isPending || upload.isPending
                  ? "Uploading & submitting…"
                  : "Submit both screenshots for review"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Submissions() {
  const result = trpc.member.mySubmissions.useQuery();
  return (
    <>
      <Intro
        eyebrow="Evidence and decisions"
        title="My submissions."
        description="See pending, approved and rejected task and WhatsApp campaign evidence. Reasons remain attached to the review record."
      />
      {result.isLoading ? (
        <p className="muted">Loading submissions…</p>
      ) : (
        <>
          <section className="surface surface-pad">
            <h2 className="surface-title">Task work</h2>
            {!result.data?.tasks.length ? (
              <Empty
                title="No task submissions yet"
                text="Start a task to create a submission record."
                href="/tasks"
              />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Category</th>
                      <th>Reward</th>
                      <th>Status</th>
                      <th>Submitted</th>
                      <th>Reviewer note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.tasks.map(row => (
                      <tr key={row.id}>
                        <td>{row.title ?? `Task #${row.taskId}`}</td>
                        <td>{row.category ?? "—"}</td>
                        <td>{formatKes(row.rewardMinor)}</td>
                        <td>
                          <Badge value={row.status} />
                        </td>
                        <td>{formatDate(row.submittedAt)}</td>
                        <td>{row.reviewNote || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="surface surface-pad" style={{ marginTop: 14 }}>
            <h2 className="surface-title">WhatsApp ads</h2>
            {!result.data?.whatsappAds.length ? (
              <Empty
                title="No WhatsApp evidence yet"
                text="Available campaigns appear when they are funded, approved and within their limits."
                href="/whatsapp-ads"
              />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Eligible views</th>
                      <th>Reward</th>
                      <th>Status</th>
                      <th>Submitted</th>
                      <th>Review note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.whatsappAds.map(row => (
                      <tr key={row.id}>
                        <td>{row.title ?? `Campaign #${row.campaignId}`}</td>
                        <td>{row.eligibleViews.toLocaleString()}</td>
                        <td>{formatKes(row.rewardMinor)}</td>
                        <td>
                          <Badge value={row.status} />
                        </td>
                        <td>{formatDate(row.submittedAt)}</td>
                        <td>{row.reviewNote || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

function WalletPage({ wallet, isActive }: { wallet: any; isActive: boolean }) {
  const ledger = trpc.member.history.useQuery();
  return (
    <>
      <Intro
        eyebrow="Real ledger entries"
        title="Wallet & earnings."
        description="Only approved task, ad and referral credits change available balance. Pending evidence remains pending until review."
        action={
          <Link href="/withdraw" className="button-app">
            Withdraw <ArrowDownToLine size={15} />
          </Link>
        }
      />
      {!isActive && <ActivationPrompt isActive={false} />}
      <div className="dashboard-grid">
        <Metric
          label="Available"
          value={formatKes(wallet?.availableMinor ?? 0)}
          foot="Eligible to request"
        />
        <Metric
          label="Pending"
          value={formatKes(wallet?.pendingMinor ?? 0)}
          foot="Awaiting review"
        />
        <Metric
          label="Lifetime credits"
          value={formatKes(wallet?.lifetimeMinor ?? 0)}
          foot="Approved records"
        />
        <Metric
          label="Referral credits"
          value={formatKes(wallet?.referralEarningsMinor ?? 0)}
          foot="Eligible activated referrals"
        />
      </div>
      <section className="surface surface-pad">
        <div className="section-line">
          <h2 className="surface-title">Latest ledger entries</h2>
          <Link className="text-link" href="/history">
            Full history <ArrowRight size={14} />
          </Link>
        </div>
        {ledger.isLoading ? (
          <p className="muted">Loading…</p>
        ) : !ledger.data?.length ? (
          <Empty
            title="No wallet activity yet"
            text="Your wallet begins at KES 0.00. Approved credits and withdrawal holds are recorded as they happen."
          />
        ) : (
          <LedgerTable rows={ledger.data} />
        )}
      </section>
    </>
  );
}
function LedgerTable({ rows }: { rows: any[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Activity</th>
            <th>Direction</th>
            <th>Amount</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              <td>{formatDate(row.createdAt)}</td>
              <td>{row.note ?? row.kind.replaceAll("_", " ")}</td>
              <td>{row.direction}</td>
              <td className="money">
                {row.direction === "credit" ? "+" : "−"}
                {formatKes(row.amountMinor)}
              </td>
              <td>
                {row.referenceType} #{row.referenceId}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WithdrawPage({
  user,
  wallet,
  isActive,
}: {
  user: User;
  wallet: any;
  isActive: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const query = trpc.member.withdrawals.useQuery();
  const withdraw = trpc.member.withdraw.useMutation();
  const utils = trpc.useUtils();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await withdraw.mutateAsync({ amountKes: Number(amount) });
      toast.success(result.message);
      setAmount("");
      setConfirmed(false);
      await Promise.all([
        utils.member.wallet.invalidate(),
        utils.member.withdrawals.invalidate(),
        utils.member.history.invalidate(),
      ]);
    } catch (error) {
      toast.error(errorText(error));
    }
  };
  return (
    <>
      <Intro
        eyebrow="M-Pesa request"
        title="Withdraw from your wallet."
        description="Requests reserve available funds while they are reviewed. KaziFlow does not label a request Paid without an actual M-Pesa receipt recorded by an administrator."
      />
      <ActivationPrompt isActive={isActive} />
      {!user.mpesaPhone && (
        <div className="notice">
          <UserRound size={17} />
          <span>
            <strong>Set your M-Pesa number first</strong>Save the correct payout
            number in your profile before submitting a withdrawal.
            <Link className="notice-link" href="/profile">
              {" "}
              Edit profile
            </Link>
          </span>
        </div>
      )}
      <div className="split-grid" style={{ marginTop: 14 }}>
        <form className="surface surface-pad form-stack" onSubmit={submit}>
          <h2 className="surface-title">Request a withdrawal</h2>
          <div className="field-grid">
            <label className="field">
              <span>Amount (KES)</span>
              <input
                className="input"
                type="number"
                min="1"
                step="1"
                required
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Enter whole KES"
              />
            </label>
            <label className="field">
              <span>Saved M-Pesa number</span>
              <input
                className="input"
                readOnly
                value={user.mpesaPhone ?? "Add number in profile"}
              />
            </label>
          </div>
          <p className="muted">
            Available balance: <b>{formatKes(wallet?.availableMinor ?? 0)}</b>.
            Minimum, fees, single-transaction and rolling 24-hour limits are set
            by administrators.
          </p>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
            />{" "}
            I confirm this is my correct M-Pesa payout number, and I understand
            this is a request—not an instant payment.
          </label>
          <button
            className="button-app"
            disabled={
              !isActive || !user.mpesaPhone || !confirmed || withdraw.isPending
            }
          >
            {withdraw.isPending ? "Submitting…" : "Reserve funds & submit"}{" "}
            <ArrowRight size={14} />
          </button>
        </form>
        <section className="surface surface-pad">
          <h2 className="surface-title">Request states</h2>
          <div className="status-list">
            <div>
              <Badge value="pending" />
              <p>Request received; amount reserved from available balance.</p>
            </div>
            <div>
              <Badge value="processing" />
              <p>Administrator is handling the M-Pesa payout.</p>
            </div>
            <div>
              <Badge value="paid" />
              <p>Actual payout reference has been recorded.</p>
            </div>
            <div>
              <Badge value="rejected" />
              <p>
                Request rejected; reserved amount returns to available balance.
              </p>
            </div>
          </div>
        </section>
      </div>
      <section className="surface surface-pad" style={{ marginTop: 14 }}>
        <h2 className="surface-title">My withdrawal requests</h2>
        {!query.data?.length ? (
          <Empty
            title="No withdrawal requests"
            text="Requests and their final references will appear here."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Requested</th>
                  <th>Amount</th>
                  <th>Fee</th>
                  <th>Receive</th>
                  <th>Number</th>
                  <th>Status</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {query.data.map(row => (
                  <tr key={row.id}>
                    <td>{formatDate(row.createdAt)}</td>
                    <td>{formatKes(row.amountMinor)}</td>
                    <td>{formatKes(row.feeMinor)}</td>
                    <td>{formatKes(row.payoutMinor)}</td>
                    <td>{row.mpesaPhone}</td>
                    <td>
                      <Badge value={row.status} />
                    </td>
                    <td>{row.payoutReference ?? row.adminNote ?? "—"}</td>
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

function ActivationPage({ isActive, user }: { isActive: boolean; user: User }) {
  const status = trpc.member.activationStatus.useQuery();
  const [phone, setPhone] = useState(user.mpesaPhone ?? user.phone ?? "");
  const [accepted, setAccepted] = useState(false);
  const start = trpc.member.startActivation.useMutation();
  const utils = trpc.useUtils();
  const begin = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await start.mutateAsync({ phone });
      if (result.alreadyActivated) {
        toast.success("Your account is already activated.");
        await utils.auth.me.invalidate();
      } else
        toast.success(
          "M-Pesa prompt requested. Activation remains pending until Daraja confirms payment."
        );
      await utils.member.activationStatus.invalidate();
    } catch (error) {
      toast.error(errorText(error));
    }
  };
  return (
    <>
      <Intro
        eyebrow="One-time member activation"
        title={
          isActive
            ? "Your account is activated."
            : "Activate before your first task."
        }
        description={
          isActive
            ? "You can browse task listings, post eligible WhatsApp ads and request wallet withdrawals based on actual records."
            : "The account fee is KES 100 once. Your account activates only after the server receives matching callback data and confirms the transaction with Safaricom Daraja."
        }
      />
      {isActive ? (
        <div className="notice">
          <Check size={17} />
          <span>
            <strong>Activation confirmed</strong>Your account status is recorded
            in the member ledger.
          </span>
        </div>
      ) : (
        <div className="activation-panel">
          <div className="activation-amount">
            <span>One-time account fee</span>
            <strong>{formatKes((status.data?.feeKes ?? 100) * 100)}</strong>
            <small>Pay through a Safaricom STK Push prompt.</small>
          </div>
          {status.data?.darajaReady ? (
            <form className="form-stack" onSubmit={begin}>
              <label className="field">
                <span>M-Pesa number to receive the STK prompt</span>
                <input
                  className="input"
                  required
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+254 7XX XXX XXX"
                />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  required
                  checked={accepted}
                  onChange={e => setAccepted(e.target.checked)}
                />{" "}
                I understand my account is activated only after the provider
                confirms the payment.
              </label>
              <button
                className="button-app"
                disabled={!accepted || start.isPending}
              >
                {start.isPending
                  ? "Requesting prompt…"
                  : "Request M-Pesa prompt"}{" "}
                <ArrowRight size={15} />
              </button>
            </form>
          ) : (
            <div className="notice">
              <ShieldCheck size={17} />
              <span>
                <strong>
                  Daraja setup is required before payments can be accepted
                </strong>
                Configure server-side Safaricom credentials and a public HTTPS
                callback URL. No payment will be simulated and no account will
                be activated without provider confirmation.
              </span>
            </div>
          )}
          <section className="activation-steps">
            <h2>What happens next</h2>
            <ol>
              <li>Safaricom sends an STK Push to your number.</li>
              <li>You approve or decline it on your phone.</li>
              <li>
                KaziFlow validates the callback amount and phone, then queries
                the stored checkout with Daraja.
              </li>
              <li>
                Your account activates only after verified success. A pending or
                mismatched transaction goes to admin investigation.
              </li>
            </ol>
          </section>
        </div>
      )}
      <section className="surface surface-pad" style={{ marginTop: 15 }}>
        <h2 className="surface-title">Activation payment history</h2>
        {status.data?.payments?.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Initiated</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Receipt</th>
                  <th>Provider status</th>
                </tr>
              </thead>
              <tbody>
                {status.data.payments.map((row: any) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.createdAt)}</td>
                    <td>{formatKes(row.amountMinor)}</td>
                    <td>
                      <Badge value={row.status} />
                    </td>
                    <td>{row.receipt ?? "—"}</td>
                    <td>
                      {row.resultDescription ?? "Awaiting provider result"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No activation attempts recorded.</p>
        )}
      </section>
    </>
  );
}

function Referrals() {
  const query = trpc.member.referrals.useQuery();
  const [copied, setCopied] = useState(false);
  const link = query.data?.code
    ? `${window.location.origin}/register?ref=${encodeURIComponent(query.data.code)}`
    : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Referral link copied.");
    } catch {
      toast.error("Could not access the clipboard. Copy the link manually.");
    }
  };
  return (
    <>
      <Intro
        eyebrow="Member referrals"
        title="Invite someone with a clear link."
        description="Referral commissions are set by administrators and are recorded only when the configured eligibility rule is satisfied."
      />
      <div className="dashboard-grid">
        <Metric
          label="Referrals"
          value={String(query.data?.total ?? 0)}
          foot="Accounts attributed to your code"
        />
        <Metric
          label="Activated referrals"
          value={String(query.data?.activated ?? 0)}
          foot="Provider-confirmed member activation"
        />
        <Metric
          label="Commission credits"
          value={formatKes(query.data?.commissionMinor ?? 0)}
          foot="Credited referral rewards"
        />
      </div>
      <section className="surface surface-pad">
        <h2 className="surface-title">Your unique referral link</h2>
        <div className="copy-line">
          <code>{link || "Loading referral code…"}</code>
          <button
            className="button-app secondary"
            onClick={() => void copy()}
            disabled={!link}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <p className="muted">
          Share the link honestly. Commission eligibility and amount depend on
          administrator settings; no commission is guaranteed before its rule is
          fulfilled.
        </p>
      </section>
      <section className="surface surface-pad" style={{ marginTop: 14 }}>
        <h2 className="surface-title">Referral activity</h2>
        {!query.data?.referrals.length ? (
          <Empty
            title="No referral activity yet"
            text="Your attributed sign-ups and activation status will appear when someone registers with your code."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Joined</th>
                  <th>Activation</th>
                </tr>
              </thead>
              <tbody>
                {query.data.referrals.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{formatDate(r.joinedAt)}</td>
                    <td>
                      <Badge value={r.activated ? "activated" : "pending"} />
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

function HistoryPage() {
  const query = trpc.member.history.useQuery();
  return (
    <>
      <Intro
        eyebrow="Wallet audit trail"
        title="Transaction history."
        description="Ledger entries are created for approved credits, holds, releases, confirmed payout settlements and configured fees."
      />
      <section className="surface surface-pad">
        {query.isLoading ? (
          <p className="muted">Loading…</p>
        ) : query.data?.length ? (
          <LedgerTable rows={query.data} />
        ) : (
          <Empty
            title="No transactions recorded"
            text="Nothing has been seeded into your balance. Actual transaction records will appear here."
          />
        )}
      </section>
    </>
  );
}

function Profile({ user }: { user: User }) {
  const [form, setForm] = useState({
    name: user.name ?? "",
    phone: user.phone ?? "",
    county: user.county ?? "Nairobi",
    mpesaPhone: user.mpesaPhone ?? "",
  });
  const save = trpc.auth.updateProfile.useMutation();
  const utils = trpc.useUtils();
  const update = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await save.mutateAsync(form);
      await utils.auth.me.invalidate();
      toast.success("Profile saved.");
    } catch (error) {
      toast.error(errorText(error));
    }
  };
  return (
    <>
      <Intro
        eyebrow="Personal details"
        title="Profile and payout number."
        description="Keep your contact and county information accurate. M-Pesa withdrawals use the saved payout number."
      />
      <form className="surface surface-pad form-stack" onSubmit={update}>
        <div className="field-grid">
          {(
            [
              ["name", "Full name"],
              ["phone", "Phone number"],
              ["county", "County"],
              ["mpesaPhone", "M-Pesa payout number"],
            ] as const
          ).map(([key, label]) => (
            <label className="field" key={key}>
              <span>{label}</span>
              <input
                className="input"
                required
                value={form[key]}
                onChange={e => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="field">
            <span>Email address</span>
            <input className="input" readOnly value={user.email ?? "—"} />
            <small>
              Ask support if you need help correcting an email address.
            </small>
          </label>
          <label className="field">
            <span>Email verification</span>
            <input
              className="input"
              readOnly
              value={
                user.emailVerifiedAt
                  ? "Verified"
                  : "Not verified or mail delivery not configured"
              }
            />
          </label>
        </div>
        <button className="button-app" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save profile"} <Check size={15} />
        </button>
      </form>
    </>
  );
}

function SupportPage() {
  const tickets = trpc.member.supportTickets.useQuery();
  const create = trpc.member.createSupportTicket.useMutation();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const utils = trpc.useUtils();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await create.mutateAsync({ subject, message });
      toast.success(result.message);
      setSubject("");
      setMessage("");
      await utils.member.supportTickets.invalidate();
    } catch (error) {
      toast.error(errorText(error));
    }
  };
  return (
    <>
      <Intro
        eyebrow="Account help"
        title="Support centre."
        description="Create a private support request for account, activation, task, campaign or withdrawal questions. Keep payment receipts and PINs private."
      />
      <div className="split-grid">
        <form className="surface surface-pad form-stack" onSubmit={submit}>
          <h2 className="surface-title">Open a support request</h2>
          <label className="field">
            <span>Subject</span>
            <input
              className="input"
              required
              minLength={4}
              maxLength={180}
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Help with payment attempt"
            />
          </label>
          <label className="field">
            <span>Details</span>
            <textarea
              className="textarea"
              required
              minLength={20}
              maxLength={5000}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Describe the issue and include a transaction reference if relevant. Never include your password or M-Pesa PIN."
            />
          </label>
          <button className="button-app" disabled={create.isPending}>
            {create.isPending ? "Saving…" : "Send to support"}{" "}
            <ArrowRight size={14} />
          </button>
        </form>
        <aside className="surface surface-pad">
          <h2 className="surface-title">Safe support reminders</h2>
          <ul className="check-list">
            <li>
              Share your payment receipt/reference, not a PIN or one-time code.
            </li>
            <li>
              Provider payments can remain pending while Safaricom confirms the
              transaction.
            </li>
            <li>
              Withdrawal requests are manual; status changes do not represent an
              unconfirmed payment.
            </li>
            <li>
              WhatsApp screenshots are reviewed evidence, not an independent
              viewer count.
            </li>
          </ul>
        </aside>
      </div>
      <section className="surface surface-pad" style={{ marginTop: 14 }}>
        <h2 className="surface-title">My requests</h2>
        {!tickets.data?.length ? (
          <p className="muted">No support requests yet.</p>
        ) : (
          <div className="ticket-list">
            {tickets.data.map(ticket => (
              <article className="ticket-row" key={ticket.id}>
                <div>
                  <div className="section-line">
                    <b>{ticket.subject}</b>
                    <Badge value={ticket.status} />
                  </div>
                  <p>{ticket.message}</p>
                  {ticket.adminReply && (
                    <div className="reply-note">
                      <b>Administrator response</b>
                      <p>{ticket.adminReply}</p>
                    </div>
                  )}
                  <small>{formatDate(ticket.createdAt)}</small>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function MemberReview() {
  const mine = trpc.reviews.mine.useQuery();
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  useEffect(() => {
    if (mine.data && content === "") {
      setRating(mine.data.rating);
      setContent(mine.data.content);
    }
  }, [mine.data]);
  const save = trpc.reviews.submit.useMutation();
  const utils = trpc.useUtils();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await save.mutateAsync({ rating, content });
      toast.success(result.message);
      await Promise.all([
        utils.reviews.mine.invalidate(),
        utils.reviews.publicApproved.invalidate(),
      ]);
    } catch (error) {
      toast.error(errorText(error));
    }
  };
  return (
    <>
      <Intro
        eyebrow="Member community"
        title="Share a review."
        description="One review per account; edits return to pending review. Only administrator-approved reviews appear publicly."
      />
      {mine.data?.status === "pending" && (
        <div className="notice">
          <Clock3 size={16} />
          <span>
            <strong>Your review is awaiting moderation</strong>Changes made
            below will go back to the review queue.
          </span>
        </div>
      )}
      {mine.data?.status === "rejected" && (
        <div className="notice">
          <X size={16} />
          <span>
            <strong>Your review was not approved</strong>
            {mine.data.reviewNote ||
              "Edit your wording and resubmit for moderator review."}
          </span>
        </div>
      )}
      <form className="surface surface-pad form-stack" onSubmit={submit}>
        <label className="field">
          <span>Rating</span>
          <select
            className="select"
            value={rating}
            onChange={e => setRating(Number(e.target.value))}
          >
            {[5, 4, 3, 2, 1].map(value => (
              <option key={value} value={value}>
                {value} / 5
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Your experience (20–1,000 characters)</span>
          <textarea
            className="textarea"
            minLength={20}
            maxLength={1000}
            required
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Describe your own experience accurately. Do not include private financial or personal information."
          />
        </label>
        <button className="button-app" disabled={save.isPending}>
          {save.isPending
            ? "Submitting…"
            : mine.data
              ? "Save changes for review"
              : "Submit review for moderation"}{" "}
          <ArrowRight size={14} />
        </button>
        <p className="small-muted">
          Your review is not public until an administrator approves it. The
          platform never invents member quotes or ratings.
        </p>
      </form>
    </>
  );
}
