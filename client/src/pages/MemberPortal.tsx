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
  Star,
  MailCheck,
  Loader2,
  CalendarClock,
  ArrowUpRight,
  Menu,
} from "lucide-react";
import { Wordmark } from "../components/Brand";
import { trpc } from "../lib/trpc";
import { formatKes } from "../lib/format";
import { TASK_CATEGORIES, TASK_GROUPS, categoryLabel } from "@shared/taskCategories";
import { KENYA_COUNTIES } from "@shared/counties";
import { mpesaFailureReason } from "@shared/money";

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
  marketingOptIn?: boolean;
};
const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/tasks", label: "Tasks", icon: BriefcaseBusiness },
  { href: "/whatsapp-ads", label: "WhatsApp Ads", icon: Eye },
  { href: "/submissions", label: "My Submissions", icon: FileCheck2 },
  { href: "/earnings", label: "Earnings", icon: HandCoins },
  { href: "/wallet", label: "Wallet", icon: WalletCards },
  { href: "/withdraw", label: "Withdraw", icon: ArrowDownToLine },
  { href: "/referrals", label: "Referrals", icon: Users },
  { href: "/history", label: "Transaction History", icon: History },
  { href: "/reviews", label: "Reviews", icon: Star },
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
  const isVerified = Boolean(me.data?.emailVerifiedAt ?? user.emailVerifiedAt);
  const titleMap: Record<string, string> = {
    "/dashboard": "Your work ledger",
    "/tasks": "Available tasks",
    "/whatsapp-ads": "WhatsApp Status Ads",
    "/submissions": "My submissions",
    "/earnings": "Earnings",
    "/wallet": "Wallet",
    "/withdraw": "Withdraw to M-Pesa",
    "/referrals": "Referral activity",
    "/history": "Transaction history",
    "/profile": "Account profile",
    "/support": "Support centre",
    "/activate": "Account activation",
    "/reviews": "Reviews",
  };
  const currentTitle = titleMap[path] ?? "KaziFlow";
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [path]);
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
                path === href ? "active" : ""
              }
            >
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
          <button type="button" className="app-nav-logout" onClick={onLogout}>
            <LogOut />
            <span>Logout</span>
          </button>
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
              {!isVerified ? "Email not verified" : isActive ? "Activated member" : "Activation required"}
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
            <button className="topbar-icon" onClick={onToggleTheme} aria-label="Toggle theme">
              <Moon size={15} />
            </button>
            <button className="topbar-icon" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen}>
              <Menu size={16} />
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="mobile-menu-backdrop" onClick={() => setMenuOpen(false)}>
            <nav className="mobile-menu" aria-label="Member menu" onClick={e => e.stopPropagation()}>
              <div className="section-line">
                <b>{user.name ?? "Member"}</b>
                <button className="topbar-icon" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                  <X size={16} />
                </button>
              </div>
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className={path === href ? "active" : ""}>
                  <Icon size={17} />
                  <span>{label}</span>
                </Link>
              ))}
              <button type="button" className="app-nav-logout" onClick={onLogout}>
                <LogOut />
                <span>Logout</span>
              </button>
            </nav>
          </div>
        )}
        <header className="app-topbar">
          <span className="app-topbar-title">
            Member workspace / {currentTitle}
          </span>
          <div className="app-topbar-actions">
            <span className={`badge ${isActive ? "active" : "pending"}`}>
              {!isVerified ? "Verify email" : isActive ? "Activated" : "Activation needed"}
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
            <>
              <Dashboard user={user} wallet={wallet.data} tasks={tasks.data ?? []} isActive={isActive} isVerified={isVerified} />
              <AnnouncementPopup />
            </>
          )}
          {path === "/tasks" && <TaskBoard isActive={isActive} isVerified={isVerified} />}
          {path === "/whatsapp-ads" && <WhatsAppAds isActive={isActive} />}
          {path === "/submissions" && <Submissions />}
          {path === "/wallet" && <WalletPage wallet={wallet.data} isActive={isActive} />}
          {path === "/earnings" && <EarningsPage wallet={wallet.data} />}
          {path === "/withdraw" && <WithdrawPage user={me.data ?? user} wallet={wallet.data} isActive={isActive} isVerified={isVerified} />}
          {path === "/referrals" && <Referrals />}
          {path === "/history" && <HistoryPage />}
          {path === "/profile" && <Profile user={me.data ?? user} />}
          {path === "/support" && <SupportPage />}
          {path === "/activate" && <ActivationPage isActive={isActive} isVerified={isVerified} user={me.data ?? user} />}
          {path === "/reviews" && <MemberReview user={me.data ?? user} />}
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
              "/submissions",
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
                      : href === "/submissions"
                        ? "Submissions"
                        : label}
              </span>
            </Link>
          ))}
        <button type="button" className="bottom-more" onClick={() => setMenuOpen(true)}>
          <Menu />
          <span>More</span>
        </button>
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

function VerifyPrompt({ isVerified }: { isVerified: boolean }) {
  return !isVerified ? (
    <div className="notice notice-warn">
      <MailCheck size={17} />
      <span>
        <strong>Verify your email to continue</strong>We sent a six-digit code to your email. Verification is required before activation, tasks and withdrawals.
        <Link href="/verify-email" className="notice-link">
          {" "}
          Enter code
        </Link>
      </span>
    </div>
  ) : null;
}

/** Dismissible announcement popup shown on the dashboard only, never during payments or submissions. */
function AnnouncementPopup() {
  const next = trpc.announcements.next.useQuery(undefined, { staleTime: 60_000, retry: false });
  const seen = trpc.announcements.seen.useMutation();
  const dismiss = trpc.announcements.dismiss.useMutation();
  const clicked = trpc.announcements.clicked.useMutation();
  const [closedId, setClosedId] = useState<number | null>(null);
  const item = next.data;
  useEffect(() => {
    if (item) seen.mutate({ id: item.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);
  if (!item || closedId === item.id) return null;
  const close = () => {
    setClosedId(item.id);
    dismiss.mutate({ id: item.id });
  };
  return (
    <div className="modal-backdrop announce-backdrop" role="dialog" aria-modal="true" aria-labelledby="announce-title" onClick={close}>
      <div className="announce-card" onClick={e => e.stopPropagation()}>
        <button className="topbar-icon announce-close" onClick={close} aria-label="Close announcement">
          <X size={16} />
        </button>
        {item.mediaUrl &&
          (item.mediaType === "video" ? (
            <video className="announce-media" src={item.mediaUrl} controls autoPlay muted playsInline />
          ) : (
            <img className="announce-media" src={item.mediaUrl} alt="" />
          ))}
        <div className="announce-body">
          <p className="page-eyebrow">{item.sponsorName ? `Sponsored · ${item.sponsorName}` : "KaziFlow update"}</p>
          <h2 id="announce-title">{item.title}</h2>
          <p style={{ whiteSpace: "pre-line" }}>{item.body}</p>
          <div className="button-row">
            {item.linkUrl && (
              <a
                className="button-app"
                href={item.linkUrl}
                target="_blank"
                rel="noreferrer noopener"
                onClick={() => {
                  clicked.mutate({ id: item.id });
                  setClosedId(item.id);
                }}
              >
                {item.linkLabel || "Learn more"} <ArrowUpRight size={14} />
              </a>
            )}
            <button className="button-app secondary" onClick={close}>
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dashboard({
  user,
  wallet,
  tasks,
  isActive,
  isVerified,
}: {
  user: User;
  wallet: any;
  tasks: any[];
  isActive: boolean;
  isVerified: boolean;
}) {
  const submissions = trpc.member.mySubmissions.useQuery();
  const ads = trpc.member.whatsappCampaigns.useQuery(undefined, {
    enabled: isActive,
  });
  return (
    <>
      <Intro
        eyebrow="Dashboard"
        title={`Good to see you, ${(user.name ?? "member").split(" ")[0]}.`}
        description="Your task activity and wallet balances are shown from the records attached to your account."
        action={
          <Link href="/tasks" className="button-app">
            Browse work <ArrowRight size={15} />
          </Link>
        }
      />
      <VerifyPrompt isVerified={isVerified} />
      {isVerified && <ActivationPrompt isActive={isActive} />}
      <div className="dashboard-grid">
        <Metric
          label="Total earnings"
          value={formatKes(wallet?.lifetimeMinor ?? 0)}
          foot="Approved credits only"
          icon={HandCoins}
        />
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
          label="Available tasks"
          value={String(wallet?.availableTasks ?? tasks.length)}
          foot="Availability may change"
          icon={BriefcaseBusiness}
        />
        <Metric
          label="Activation status"
          value={!isVerified ? "Verify email" : isActive ? "Activated" : "Not activated"}
          foot={
            isActive ? "Confirmed by M-Pesa" : "KES 100 one-time activation"
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
          <h2 className="surface-title">Recent transactions</h2>
          {(wallet?.recentTransactions?.length ?? 0) > 0 ? (
            <div className="activity-list">
              {wallet.recentTransactions.slice(0, 4).map((row: any) => (
                <div className="activity-row" key={row.id}>
                  <span>
                    <b>{ledgerLabel[row.kind] ?? row.kind.replaceAll("_", " ")}</b>
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
  imageUrl?: string | null;
  category: string;
  group: string;
  title: string;
  description: string;
  instructions: string;
  completionRequirements: string;
  rewardMinor: number;
  estimatedMinutes: number;
  slotLimit: number;
  slotsTaken: number;
  slotsLeft: number;
  completionMode: string;
  externalUrl: string | null;
  requiresEvidence: boolean;
  repeatDaily: boolean;
  sponsorName: string | null;
  featured: boolean;
  expiresAt: Date | string | null;
  quiz: { question: string; options: string[] }[];
  myStatus: null | "pending" | "approved" | "rejected";
};
const navigate = (to: string) => {
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
};
export function TaskCard({ task, cta, onStart, disabled }: { task: TaskRow; cta: string; onStart: () => void; disabled?: boolean }) {
  const done = task.myStatus === "approved" || task.myStatus === "pending";
  return (
    <article className={`task-card${task.featured ? " task-card-featured" : ""}`}>
      {task.imageUrl && <img className="task-card-image" src={task.imageUrl} alt="" loading="lazy" />}
      <div className="task-meta">
        <span className="badge">{categoryLabel(task.category)}</span>
        {task.featured && <span className="badge active">Featured</span>}
        {task.repeatDaily && <span className="badge processing">Daily</span>}
        {task.myStatus && <Badge value={task.myStatus} />}
      </div>
      <h3>{task.title}</h3>
      {task.sponsorName && <p className="small-muted">Sponsored by {task.sponsorName}</p>}
      <p>{task.description}</p>
      <div className="task-meta">
        <span>
          <Clock3 size={13} /> {task.estimatedMinutes} min
        </span>
        <span>
          <Users size={13} /> {task.slotsLeft} slots left
        </span>
        <span>
          <FileCheck2 size={13} /> {task.completionMode === "quiz" ? `${task.quiz.length} questions` : task.requiresEvidence ? "Screenshot needed" : "Written proof"}
        </span>
        {task.expiresAt && (
          <span>
            <CalendarClock size={13} /> Ends {formatDate(task.expiresAt)}
          </span>
        )}
      </div>
      <div className="task-requirements">
        <b>Submission requirements</b>
        <p>{task.completionRequirements}</p>
      </div>
      <div className="task-card-foot">
        <strong className="task-reward">{formatKes(task.rewardMinor)}</strong>
        <button className="button-app" disabled={disabled || done || task.slotsLeft <= 0} onClick={onStart}>
          {done ? (task.myStatus === "approved" ? "Completed" : "Under review") : cta} <ArrowRight size={14} />
        </button>
      </div>
    </article>
  );
}

function TaskBoard({ isActive, isVerified }: { isActive: boolean; isVerified: boolean }) {
  const [group, setGroup] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [attempt, setAttempt] = useState<{ task: TaskRow; attemptId: number; startedAt: string } | null>(null);
  const query = trpc.member.tasks.useQuery(
    category !== "all" ? { category: category as any } : group !== "all" ? { group: group as any } : undefined
  );
  const start = trpc.member.startTask.useMutation();
  const submit = trpc.member.submitTask.useMutation();
  const upload = trpc.member.uploadEvidence.useMutation();
  const utils = trpc.useUtils();
  const [proof, setProof] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!attempt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [attempt]);
  const begin = async (task: TaskRow) => {
    if (!isVerified) {
      toast.info("Verify your email first.");
      navigate("/verify-email");
      return;
    }
    if (!isActive) {
      toast.info("Activate your account (one-time KES 100) to start tasks.");
      navigate("/activate");
      return;
    }
    try {
      const result = await start.mutateAsync({ taskId: task.id });
      if (result.needsVerification) return navigate("/verify-email");
      if (result.needsActivation) return navigate("/activate");
      setAttempt({ task: result.task as unknown as TaskRow, attemptId: result.attemptId!, startedAt: result.startedAt! });
      setProof("");
      setEvidence(null);
      setAnswers([]);
    } catch (error) {
      toast.error(errorText(error));
    }
  };
  const submitTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!attempt) return;
    try {
      let evidenceAssetId: number | undefined;
      if (evidence) evidenceAssetId = (await upload.mutateAsync({ mime: evidence.type as any, base64: await toBase64(evidence) })).assetId;
      const result = await submit.mutateAsync({
        taskId: attempt.task.id,
        attemptId: attempt.attemptId,
        proofText: proof,
        evidenceAssetId,
        quizAnswers: attempt.task.completionMode === "quiz" ? answers : undefined,
      });
      if (result.status === "approved") toast.success(result.message);
      else toast.success(result.quizScore !== null ? `Submitted. Your score: ${result.quizScore}%. Awaiting review.` : result.message);
      setAttempt(null);
      await Promise.all([utils.member.mySubmissions.invalidate(), utils.member.wallet.invalidate(), utils.member.tasks.invalidate()]);
    } catch (error) {
      toast.error(errorText(error));
    }
  };
  const minimumSeconds = attempt ? (attempt.task.completionMode === "video_progress" ? attempt.task.estimatedMinutes * 60 : Math.ceil(attempt.task.estimatedMinutes * 30)) : 0;
  const remaining = Math.max(0, minimumSeconds - elapsed);
  const groupCats = TASK_CATEGORIES.filter(c => group === "all" || c.group === group);
  const quizReady = !attempt || attempt.task.completionMode !== "quiz" || (answers.length === attempt.task.quiz.length && answers.every(a => a !== undefined));
  return (
    <>
      <Intro
        eyebrow="Find a clear brief"
        title="Choose your next task."
        description="Every listing shows the work, time estimate, submission requirements, reward in KES and remaining slots."
      />
      <VerifyPrompt isVerified={isVerified} />
      {isVerified && <ActivationPrompt isActive={isActive} />}
      <div className="filter-row" style={{ marginTop: 15 }}>
        <button type="button" className={`filter-pill ${group === "all" ? "active" : ""}`} onClick={() => { setGroup("all"); setCategory("all"); }}>
          All tasks
        </button>
        {TASK_GROUPS.map(g => (
          <button type="button" key={g.id} className={`filter-pill ${group === g.id ? "active" : ""}`} onClick={() => { setGroup(g.id); setCategory("all"); }}>
            {g.label}
          </button>
        ))}
      </div>
      <div className="filter-row filter-row-sub">
        {groupCats.map(c => (
          <button
            type="button"
            key={c.id}
            className={`filter-chip ${category === c.id ? "active" : ""}`}
            onClick={() => (c.id === "whatsapp_status" ? navigate("/whatsapp-ads") : c.id === "referral" ? navigate("/referrals") : setCategory(category === c.id ? "all" : c.id))}
          >
            {c.label}
          </button>
        ))}
      </div>
      {query.isLoading ? (
        <p className="muted">Loading available tasks…</p>
      ) : (query.data?.length ?? 0) === 0 ? (
        <Empty
          title="No tasks in this category right now"
          text="New tasks are published by the KaziFlow team and advertisers. Check again later or try another category."
          href="/whatsapp-ads"
          link="Browse WhatsApp Status Ads"
        />
      ) : (
        <div className="task-grid">
          {(query.data as unknown as TaskRow[]).map(task => (
            <TaskCard key={task.id} task={task} disabled={start.isPending} onStart={() => void begin(task)} cta={!isVerified ? "Verify to start" : isActive ? "Start task" : "Activate to start"} />
          ))}
        </div>
      )}
      {attempt && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-head">
              <div>
                <p className="page-eyebrow">{categoryLabel(attempt.task.category)} · {formatKes(attempt.task.rewardMinor)}</p>
                <h2>{attempt.task.title}</h2>
                <p>Follow the instructions and submit honest, original proof.</p>
              </div>
              <button className="topbar-icon" onClick={() => setAttempt(null)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="notice">
              <Clock3 size={16} />
              <span>
                <strong>Time on task: {Math.floor(elapsed / 60)} min {elapsed % 60} sec</strong>
                {remaining > 0 ? `You can submit in ${Math.ceil(remaining / 60)} minute(s).` : "You can submit now."} KaziFlow checks time spent; reviewers check your proof.
              </span>
            </div>
            {attempt.task.imageUrl && (
              <a href={attempt.task.imageUrl} target="_blank" rel="noreferrer noopener" title="Open full picture">
                <img className="task-modal-image" src={attempt.task.imageUrl} alt={`Picture for ${attempt.task.title}`} />
              </a>
            )}
            {attempt.task.externalUrl && (
              <a className="button-app secondary" target="_blank" rel="noreferrer noopener" href={attempt.task.externalUrl} style={{ marginTop: 14 }}>
                Open task link <ArrowUpRight size={14} />
              </a>
            )}
            <div className="surface surface-pad" style={{ marginTop: 14 }}>
              <b>Instructions</b>
              <p className="muted" style={{ whiteSpace: "pre-line" }}>{attempt.task.instructions}</p>
              <b>Submission requirements</b>
              <p className="muted" style={{ whiteSpace: "pre-line" }}>{attempt.task.completionRequirements}</p>
            </div>
            <form className="form-stack" onSubmit={submitTask} style={{ marginTop: 14 }}>
              {attempt.task.completionMode === "quiz" ? (
                <div className="quiz-list">
                  {attempt.task.quiz.map((q, qi) => (
                    <fieldset className="quiz-question" key={qi}>
                      <legend>
                        {qi + 1}. {q.question}
                      </legend>
                      {q.options.map((option, oi) => (
                        <label key={oi} className={`quiz-option${answers[qi] === oi ? " selected" : ""}`}>
                          <input
                            type="radio"
                            name={`q-${qi}`}
                            checked={answers[qi] === oi}
                            onChange={() => {
                              const next = [...answers];
                              next[qi] = oi;
                              setAnswers(next);
                            }}
                          />
                          {option}
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>
              ) : (
                <label className="field">
                  <span>What did you complete? Add the requested proof.</span>
                  <textarea className="textarea" required minLength={3} maxLength={5000} value={proof} onChange={e => setProof(e.target.value)} placeholder="Describe what you did, or paste the username/link/reference the task asks for…" />
                </label>
              )}
              {attempt.task.completionMode !== "quiz" || attempt.task.requiresEvidence ? (
                <label className="field">
                  <span>Screenshot evidence {attempt.task.requiresEvidence ? "(required)" : "(optional)"}</span>
                  <input className="input" type="file" required={attempt.task.requiresEvidence} accept="image/jpeg,image/png,image/webp" onChange={e => setEvidence(e.target.files?.[0] ?? null)} />
                  <small>JPEG, PNG or WebP up to 3 MB. Each screenshot can only be used once.</small>
                </label>
              ) : null}
              <button className="button-app" disabled={remaining > 0 || !quizReady || submit.isPending || upload.isPending}>
                {remaining > 0 ? `Available in ${Math.ceil(remaining / 60)} minute(s)` : submit.isPending || upload.isPending ? "Submitting…" : "Submit for review"}
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
  myStatus: string | null;
  endsAt: Date | string;
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
                  <span>Ends {formatDate(campaign.endsAt)}</span>
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
                {campaign.myStatus ? (
                  <div className="section-line">
                    <span className="muted">Your evidence</span>
                    <Badge value={campaign.myStatus} />
                  </div>
                ) : (
                  <button
                    className="button-app"
                    disabled={!isActive || campaign.participants >= campaign.participantLimit}
                    onClick={() => openCampaign(campaign)}
                  >
                    Post & submit evidence <ArrowRight size={14} />
                  </button>
                )}
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
                  <span>Views shown on your screenshot</span>
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
                      <th>Score</th>
                      <th>Status</th>
                      <th>Submitted</th>
                      <th>Reviewer note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.tasks.map(row => (
                      <tr key={row.id}>
                        <td>{row.title ?? `Task #${row.taskId}`}</td>
                        <td>{row.category ? categoryLabel(row.category) : "—"}</td>
                        <td>{formatKes(row.rewardMinor)}</td>
                        <td>{row.quizScore !== null ? `${row.quizScore}%` : "—"}</td>
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
                      <th>Reported views</th>
                      <th>Approved views</th>
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
                        <td>{row.reportedViews.toLocaleString()}</td>
                        <td>{row.status === "pending" ? "In review" : row.eligibleViews.toLocaleString()}</td>
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
  const history = trpc.member.history.useQuery();
  return (
    <>
      <Intro
        eyebrow="Your balances"
        title="Wallet."
        description="Available balance can be withdrawn to M-Pesa. Pending earnings become available only after a reviewer approves your work."
        action={
          <Link href="/withdraw" className="button-app">
            Withdraw <ArrowDownToLine size={15} />
          </Link>
        }
      />
      {!isActive && <ActivationPrompt isActive={false} />}
      <div className="dashboard-grid">
        <Metric label="Available balance" value={formatKes(wallet?.availableMinor ?? 0)} foot="Ready to withdraw" icon={WalletCards} />
        <Metric label="Pending earnings" value={formatKes(wallet?.pendingMinor ?? 0)} foot="Awaiting review" icon={Clock3} />
        <Metric label="Withdrawals in progress" value={formatKes(wallet?.withdrawalsInProgressMinor ?? 0)} foot="Reserved for M-Pesa" icon={ArrowDownToLine} />
        <Metric label="Paid to M-Pesa" value={formatKes(wallet?.withdrawnMinor ?? 0)} foot="Confirmed by Safaricom" icon={Check} />
      </div>
      <section className="surface surface-pad">
        <div className="section-line">
          <h2 className="surface-title">Recent transactions</h2>
          <Link className="text-link" href="/history">
            Full history <ArrowRight size={14} />
          </Link>
        </div>
        {history.isLoading ? (
          <p className="muted">Loading…</p>
        ) : !history.data?.ledger.length ? (
          <Empty title="No wallet activity yet" text="Your wallet starts at KES 0. Approved rewards, withdrawal holds and releases appear here as they happen." />
        ) : (
          <LedgerTable rows={history.data.ledger.slice(0, 10)} />
        )}
      </section>
    </>
  );
}

const earningKinds: Record<string, string> = {
  task_credit: "Task rewards",
  ad_credit: "WhatsApp Status Ads",
  referral_credit: "Referral commissions",
  daily_credit: "Daily rewards",
  adjustment: "Adjustments",
};
function EarningsPage({ wallet }: { wallet: any }) {
  const history = trpc.member.history.useQuery();
  const credits = (history.data?.ledger ?? []).filter(r => r.direction === "credit" && r.kind in earningKinds);
  const totals = Object.keys(earningKinds).map(kind => ({
    kind,
    label: earningKinds[kind]!,
    total: credits.filter(c => c.kind === kind).reduce((s, c) => s + c.amountMinor, 0),
    count: credits.filter(c => c.kind === kind).length,
  }));
  return (
    <>
      <Intro eyebrow="Approved rewards only" title="Earnings." description="Every shilling here comes from an approved submission, campaign or referral. Nothing is estimated or pre-filled." />
      <div className="dashboard-grid">
        <Metric label="Total earnings" value={formatKes(wallet?.lifetimeMinor ?? 0)} foot="All approved credits" icon={HandCoins} />
        <Metric label="Pending earnings" value={formatKes(wallet?.pendingMinor ?? 0)} foot="Awaiting review" icon={Clock3} />
        <Metric label="Referral earnings" value={formatKes(wallet?.referralEarningsMinor ?? 0)} foot="From activated referrals" icon={Users} />
        <Metric label="Completed tasks" value={String(wallet?.completedTasks ?? 0)} foot="Approved tasks & ads" icon={Check} />
      </div>
      <section className="surface surface-pad">
        <h2 className="surface-title">Earnings by source</h2>
        <div className="earning-bars">
          {totals.filter(t => t.kind !== "adjustment" || t.total > 0).map(t => {
            const pct = wallet?.lifetimeMinor ? Math.round((t.total / wallet.lifetimeMinor) * 100) : 0;
            return (
              <div className="earning-bar" key={t.kind}>
                <div className="section-line">
                  <span>{t.label}</span>
                  <b>{formatKes(t.total)}</b>
                </div>
                <div className="bar-track">
                  <span style={{ width: `${pct}%` }} />
                </div>
                <small className="small-muted">{t.count} credit(s)</small>
              </div>
            );
          })}
        </div>
      </section>
      <section className="surface surface-pad" style={{ marginTop: 14 }}>
        <h2 className="surface-title">Task history</h2>
        {!credits.length ? <p className="muted">Approved rewards will be listed here.</p> : <LedgerTable rows={credits} />}
      </section>
    </>
  );
}

const ledgerLabel: Record<string, string> = {
  task_credit: "Task reward",
  ad_credit: "WhatsApp Status reward",
  referral_credit: "Referral commission",
  daily_credit: "Daily reward",
  withdrawal_hold: "Withdrawal reserved",
  withdrawal_release: "Withdrawal returned",
  withdrawal_paid: "Withdrawal paid",
  withdrawal_fee: "Withdrawal fee",
  adjustment: "Adjustment",
};
function LedgerTable({ rows }: { rows: any[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Details</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              <td>{formatDate(row.createdAt)}</td>
              <td>{ledgerLabel[row.kind] ?? row.kind.replaceAll("_", " ")}</td>
              <td>{row.note ?? `${row.referenceType} #${row.referenceId}`}</td>
              <td className={`money ${row.direction === "credit" ? "money-in" : "money-out"}`}>
                {row.direction === "credit" ? "+" : "−"}
                {formatKes(row.amountMinor)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WithdrawPage({ user, wallet, isActive, isVerified }: { user: User; wallet: any; isActive: boolean; isVerified: boolean }) {
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState(user.mpesaPhone ? `0${user.mpesaPhone.slice(3)}` : "");
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const query = trpc.member.withdrawals.useQuery();
  const settings = trpc.member.withdrawalSettings.useQuery();
  const withdraw = trpc.member.withdraw.useMutation();
  const utils = trpc.useUtils();
  const phoneChanged = Boolean(phone) && toIntl(phone) !== user.mpesaPhone;
  const fee = settings.data?.feeKes ?? 0;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await withdraw.mutateAsync({ amountKes: Number(amount), mpesaPhone: phone, password: phoneChanged ? password : undefined });
      toast.success(result.message);
      setAmount("");
      setPassword("");
      setConfirmed(false);
      await Promise.all([utils.member.wallet.invalidate(), utils.member.withdrawals.invalidate(), utils.member.history.invalidate(), utils.auth.me.invalidate()]);
    } catch (error) {
      toast.error(errorText(error));
    }
  };
  return (
    <>
      <Intro eyebrow="M-Pesa withdrawal" title="Withdraw to M-Pesa." description="Your amount is reserved as soon as you submit. It is marked Paid only when Safaricom confirms the payout to your number." />
      <VerifyPrompt isVerified={isVerified} />
      {isVerified && <ActivationPrompt isActive={isActive} />}
      <div className="split-grid" style={{ marginTop: 14 }}>
        <form className="surface surface-pad form-stack" onSubmit={submit}>
          <h2 className="surface-title">Request a withdrawal</h2>
          <div className="balance-callout">
            <span>Available balance</span>
            <strong>{formatKes(wallet?.availableMinor ?? 0)}</strong>
          </div>
          <div className="field-grid">
            <label className="field">
              <span>Amount (KES)</span>
              <input className="input" type="number" inputMode="numeric" min={settings.data?.minimumKes ?? 1} step="1" required value={amount} onChange={e => setAmount(e.target.value)} placeholder={`Minimum KES ${settings.data?.minimumKes ?? 100}`} />
            </label>
            <label className="field">
              <span>M-Pesa number</span>
              <input className="input" type="tel" inputMode="tel" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="07XX XXX XXX" />
            </label>
            {phoneChanged && (
              <label className="field full">
                <span>Account password (needed to use a new M-Pesa number)</span>
                <input className="input" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
              </label>
            )}
          </div>
          <p className="muted">
            Minimum KES {settings.data?.minimumKes ?? "—"} · Fee KES {fee} · You receive{" "}
            <b>{amount && Number(amount) > fee ? `KES ${(Number(amount) - fee).toLocaleString()}` : "—"}</b>
          </p>
          <label className="checkbox-row">
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> I confirm this M-Pesa number is mine and correct.
          </label>
          <button className="button-app" disabled={!isActive || !isVerified || !confirmed || withdraw.isPending}>
            {withdraw.isPending ? "Submitting…" : "Request withdrawal"} <ArrowRight size={14} />
          </button>
        </form>
        <section className="surface surface-pad">
          <h2 className="surface-title">What each status means</h2>
          <div className="status-list">
            <div>
              <Badge value="pending" />
              <p>Received. The amount is reserved from your balance while our team reviews it.</p>
            </div>
            <div>
              <Badge value="processing" />
              <p>Sent to M-Pesa. Waiting for Safaricom's confirmation.</p>
            </div>
            <div>
              <Badge value="paid" />
              <p>Safaricom confirmed the payout. The M-Pesa receipt is shown below.</p>
            </div>
            <div>
              <Badge value="payout_failed" />
              <p>M-Pesa could not complete it. Your money is safe; we will retry or return it.</p>
            </div>
            <div>
              <Badge value="rejected" />
              <p>Not approved. The reserved amount is returned to your available balance.</p>
            </div>
          </div>
        </section>
      </div>
      <section className="surface surface-pad" style={{ marginTop: 14 }}>
        <h2 className="surface-title">My withdrawals</h2>
        {!query.data?.length ? (
          <Empty title="No withdrawal requests" text="Your requests and M-Pesa receipts will appear here." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Requested</th>
                  <th>Amount</th>
                  <th>Fee</th>
                  <th>You receive</th>
                  <th>Number</th>
                  <th>Status</th>
                  <th>M-Pesa receipt / note</th>
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
                    <td>{row.payoutReference ?? (row.status === "rejected" ? row.adminNote : null) ?? "—"}</td>
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

function ActivationPage({ isActive, isVerified, user }: { isActive: boolean; isVerified: boolean; user: User }) {
  const status = trpc.member.activationStatus.useQuery();
  const [phone, setPhone] = useState(user.mpesaPhone ? `0${user.mpesaPhone.slice(3)}` : user.phone ? `0${user.phone.slice(3)}` : "");
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const start = trpc.member.startActivation.useMutation();
  const utils = trpc.useUtils();
  const poll = trpc.member.paymentStatus.useQuery(
    { paymentId: paymentId ?? 0 },
    {
      enabled: Boolean(paymentId),
      refetchInterval: q => {
        const s = q.state.data?.status;
        return s === "succeeded" || s === "failed" || s === "verification_required" ? false : 4000;
      },
    }
  );
  const live = poll.data?.status;
  useEffect(() => {
    if (live === "succeeded") {
      toast.success("Payment confirmed by Safaricom. Your account is active!");
      void utils.auth.me.invalidate();
      void utils.member.wallet.invalidate();
      void utils.member.activationStatus.invalidate();
    }
    if (live === "failed" || live === "verification_required") void utils.member.activationStatus.invalidate();
  }, [live, utils]);
  const begin = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await start.mutateAsync({ phone });
      if (result.alreadyActivated) {
        toast.success("Your account is already activated.");
        await utils.auth.me.invalidate();
      } else {
        setPaymentId(result.paymentId ?? null);
        toast.success("Check your phone and enter your M-Pesa PIN to complete the payment.");
      }
      await utils.member.activationStatus.invalidate();
    } catch (error) {
      toast.error(errorText(error));
    }
  };
  const fee = status.data?.feeKes ?? 100;
  return (
    <>
      <Intro
        eyebrow="One-time member activation"
        title={isActive ? "Your account is active." : `Activate for KES ${fee}.`}
        description={
          isActive
            ? "You can start tasks, join WhatsApp Status campaigns and request withdrawals."
            : `Pay KES ${fee} once through an M-Pesa prompt. Your account activates only after Safaricom confirms the payment to our server.`
        }
      />
      <VerifyPrompt isVerified={isVerified} />
      {isActive ? (
        <div className="notice notice-success">
          <Check size={17} />
          <span>
            <strong>Activation confirmed</strong>Your payment was confirmed by Safaricom.
            <Link href="/tasks" className="notice-link">
              {" "}
              Browse tasks
            </Link>
          </span>
        </div>
      ) : (
        <div className="activation-panel">
          <div className="activation-amount">
            <span>One-time account fee</span>
            <strong>{formatKes(fee * 100)}</strong>
            <small>Paid once. Never pay to a personal number.</small>
          </div>
          {paymentId && live && (
            <div className={`payment-state payment-${live}`} role="status" aria-live="polite">
              {live === "pending" || live === "callback_received" ? (
                <>
                  <Loader2 size={18} className="spin" />
                  <span>
                    <b>Waiting for M-Pesa…</b>Enter your PIN on your phone. This page updates automatically.
                  </span>
                </>
              ) : live === "succeeded" ? (
                <>
                  <Check size={18} />
                  <span>
                    <b>Payment successful</b>M-Pesa receipt {poll.data?.receipt ?? "recorded"}.
                  </span>
                </>
              ) : live === "failed" ? (
                <>
                  <X size={18} />
                  <span>
                    <b>Payment not completed</b>{mpesaFailureReason(poll.data?.resultCode)}
                  </span>
                </>
              ) : (
                <>
                  <ShieldCheck size={18} />
                  <span>
                    <b>Being checked</b>We are confirming this payment with Safaricom. Please do not pay again; contact support if it takes long.
                  </span>
                </>
              )}
            </div>
          )}
          {!isVerified ? null : status.data?.darajaReady ? (
            <form className="form-stack" onSubmit={begin}>
              <label className="field">
                <span>M-Pesa number to receive the prompt</span>
                <input className="input" type="tel" inputMode="tel" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="07XX XXX XXX" />
              </label>
              <button className="button-app" disabled={start.isPending || live === "pending" || live === "callback_received"}>
                {start.isPending ? "Sending prompt…" : `Pay KES ${fee} with M-Pesa`} <ArrowRight size={15} />
              </button>
            </form>
          ) : (
            <div className="notice">
              <ShieldCheck size={17} />
              <span>
                <strong>M-Pesa payments are not available yet</strong>Our payment connection is being set up. No payment will be requested until it is ready.
              </span>
            </div>
          )}
          <section className="activation-steps">
            <h2>What happens next</h2>
            <ol>
              <li>Safaricom sends an M-Pesa prompt to your phone.</li>
              <li>Enter your M-Pesa PIN to approve KES {fee}.</li>
              <li>Our server confirms the transaction directly with Safaricom.</li>
              <li>Your account activates and you get a confirmation email.</li>
            </ol>
          </section>
        </div>
      )}
      <section className="surface surface-pad" style={{ marginTop: 15 }}>
        <h2 className="surface-title">Activation payments</h2>
        {status.data?.payments?.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>M-Pesa receipt</th>
                </tr>
              </thead>
              <tbody>
                {status.data.payments.map((row: any) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.createdAt)}</td>
                    <td>{formatKes(row.amountMinor)}</td>
                    <td>{row.phone}</td>
                    <td>
                      <Badge value={row.status === "verification_required" ? "being_checked" : row.status === "callback_received" ? "pending" : row.status} />
                    </td>
                    <td>{row.receipt ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No activation payments yet.</p>
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
        description={query.data?.commissionKes ? `Earn KES ${query.data.commissionKes} when someone you invite verifies their email and activates their account.` : "Referral commissions are set by the KaziFlow team and are credited when your referral activates."}
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
                  <th>Commission</th>
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
                    <td>{r.commissionMinor ? formatKes(r.commissionMinor) : "—"}</td>
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
      <Intro eyebrow="Audit trail" title="Transaction history." description="Every credit, withdrawal hold, release and M-Pesa payment linked to your account." />
      <section className="surface surface-pad">
        <h2 className="surface-title">Wallet transactions</h2>
        {query.isLoading ? (
          <p className="muted">Loading…</p>
        ) : query.data?.ledger.length ? (
          <LedgerTable rows={query.data.ledger} />
        ) : (
          <Empty title="No transactions yet" text="Nothing is pre-loaded into your balance. Real transactions appear here as they happen." />
        )}
      </section>
      <section className="surface surface-pad" style={{ marginTop: 14 }}>
        <h2 className="surface-title">M-Pesa payments</h2>
        {query.data?.payments.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Purpose</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {query.data.payments.map(p => (
                  <tr key={p.id}>
                    <td>{formatDate(p.createdAt)}</td>
                    <td>{p.purpose === "activation" ? "Account activation" : "Campaign funding"}</td>
                    <td>{formatKes(p.amountMinor)}</td>
                    <td>
                      <Badge value={p.status === "verification_required" ? "being_checked" : p.status} />
                    </td>
                    <td>{p.receipt ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No M-Pesa payments yet.</p>
        )}
      </section>
    </>
  );
}

const toIntl = (value: string) => {
  const d = value.replace(/[\s()+-]/g, "");
  if (/^0[17]\d{8}$/.test(d)) return `254${d.slice(1)}`;
  if (/^[17]\d{8}$/.test(d)) return `254${d}`;
  return d;
};
const toLocal = (value: string | null | undefined) => (value && value.startsWith("254") ? `0${value.slice(3)}` : (value ?? ""));

function Profile({ user }: { user: User }) {
  const [form, setForm] = useState({
    name: user.name ?? "",
    phone: toLocal(user.phone),
    county: user.county ?? "Nairobi",
    mpesaPhone: toLocal(user.mpesaPhone),
    marketingOptIn: user.marketingOptIn ?? true,
  });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const save = trpc.auth.updateProfile.useMutation();
  const change = trpc.auth.changePassword.useMutation();
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
  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (pw.newPassword !== pw.confirm) return toast.error("The new passwords do not match.");
    try {
      await change.mutateAsync({ currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      setPw({ currentPassword: "", newPassword: "", confirm: "" });
      toast.success("Password changed. Other devices have been signed out.");
    } catch (error) {
      toast.error(errorText(error));
    }
  };
  return (
    <>
      <Intro eyebrow="Personal details" title="Profile." description="Keep your details accurate. Your email and phone number are private and never shown publicly." />
      <form className="surface surface-pad form-stack" onSubmit={update}>
        <div className="field-grid">
          <label className="field">
            <span>Full name</span>
            <input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Phone number</span>
            <input className="input" type="tel" required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label className="field">
            <span>County</span>
            <select className="select" value={form.county} onChange={e => setForm({ ...form, county: e.target.value })}>
              {KENYA_COUNTIES.map(c => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>M-Pesa payout number</span>
            <input className="input" type="tel" required value={form.mpesaPhone} onChange={e => setForm({ ...form, mpesaPhone: e.target.value })} />
          </label>
          <label className="field">
            <span>Email address</span>
            <input className="input" readOnly value={user.email ?? "—"} />
          </label>
          <label className="field">
            <span>Email status</span>
            <input className="input" readOnly value={user.emailVerifiedAt ? "Verified" : "Not verified"} />
          </label>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={form.marketingOptIn} onChange={e => setForm({ ...form, marketingOptIn: e.target.checked })} /> Send me important KaziFlow announcements by email.
        </label>
        <button className="button-app" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save profile"} <Check size={15} />
        </button>
      </form>
      <form className="surface surface-pad form-stack" onSubmit={changePassword} style={{ marginTop: 14 }}>
        <h2 className="surface-title">Change password</h2>
        <div className="field-grid">
          <label className="field">
            <span>Current password</span>
            <input className="input" type="password" autoComplete="current-password" required value={pw.currentPassword} onChange={e => setPw({ ...pw, currentPassword: e.target.value })} />
          </label>
          <label className="field">
            <span>New password</span>
            <input className="input" type="password" autoComplete="new-password" required minLength={8} value={pw.newPassword} onChange={e => setPw({ ...pw, newPassword: e.target.value })} />
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input className="input" type="password" autoComplete="new-password" required value={pw.confirm} onChange={e => setPw({ ...pw, confirm: e.target.value })} />
          </label>
        </div>
        <button className="button-app secondary" disabled={change.isPending}>
          {change.isPending ? "Saving…" : "Change password"}
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
              Withdrawals are marked Paid only after Safaricom confirms the payout.
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

const toneExamples = [
  "Nimekuwa nikitumia KaziFlow and so far iko poa. Navigation ni simple na tasks zinaeleweka.",
  "Website iko simple kutumia hata ukiwa kwa simu. So far experience yangu imekuwa smooth.",
  "Si complicated kutumia. Unaingia unaona tasks available na reward yake.",
];
const suggestedDisplayName = (name: string | null | undefined) => {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.` : parts[0]!;
};

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="star-picker" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map(n => (
        <button type="button" key={n} role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} className={n <= value ? "on" : ""} onClick={() => onChange(n)}>
          ★
        </button>
      ))}
    </div>
  );
}

function MemberReview({ user }: { user: User }) {
  const mine = trpc.reviews.mine.useQuery();
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [displayName, setDisplayName] = useState(suggestedDisplayName(user.name));
  const [showCounty, setShowCounty] = useState(false);
  const [county, setCounty] = useState(user.county ?? "Nairobi");
  const [loaded, setLoaded] = useState(false);
  const data = mine.data;
  useEffect(() => {
    if (!loaded && data && !data.removed) {
      setRating(data.rating);
      setContent(data.content);
      setDisplayName(data.displayName);
      setShowCounty(data.showCounty);
      if (data.county) setCounty(data.county);
      setLoaded(true);
    }
  }, [data, loaded]);
  const save = trpc.reviews.submit.useMutation();
  const utils = trpc.useUtils();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await save.mutateAsync({ rating, content, displayName, showCounty, county: showCounty ? county : undefined });
      toast.success(result.message);
      await Promise.all([utils.reviews.mine.invalidate(), utils.reviews.publicApproved.invalidate()]);
    } catch (error) {
      toast.error(errorText(error));
    }
  };
  if (data?.removed)
    return (
      <>
        <Intro eyebrow="Community reviews" title="Your review." description="Reviews help other Kenyans understand KaziFlow." />
        <div className="notice">
          <X size={16} />
          <span>
            <strong>Your review was removed by an administrator</strong>
            {data.reviewNote ?? "Contact support if you think this was a mistake."}
          </span>
        </div>
      </>
    );
  return (
    <>
      <Intro
        eyebrow="Community reviews"
        title={data ? "Edit your review." : "Share your KaziFlow experience."}
        description="Write in English, Kiswahili or Sheng — whatever feels natural. One review per member; edits go back for approval."
      />
      <VerifyPrompt isVerified={Boolean(user.emailVerifiedAt)} />
      {data && !data.removed && (
        <div className={`notice ${data.status === "approved" ? "notice-success" : ""}`}>
          {data.status === "approved" ? <Check size={16} /> : data.status === "pending" ? <Clock3 size={16} /> : <X size={16} />}
          <span>
            <strong>{data.status === "approved" ? "Your review is live on the homepage" : data.status === "pending" ? "Your review is waiting for approval" : "Your review was not approved"}</strong>
            {data.status === "rejected" ? data.reviewNote || "Edit it and submit again." : data.status === "approved" ? "Editing it will send it back for approval." : "We usually review within a day."}
          </span>
        </div>
      )}
      <div className="split-grid">
        <form className="surface surface-pad form-stack" onSubmit={submit}>
          <div className="field">
            <span>Your rating</span>
            <StarPicker value={rating} onChange={setRating} />
          </div>
          <label className="field">
            <span>Your review (20–1,000 characters)</span>
            <textarea className="textarea" minLength={20} maxLength={1000} required value={content} onChange={e => setContent(e.target.value)} placeholder={toneExamples[0]} rows={5} />
            <small>{content.length}/1000 · No phone numbers, emails or links.</small>
          </label>
          <div className="field-grid">
            <label className="field">
              <span>Name to show publicly</span>
              <input className="input" required maxLength={40} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Akinyi M." />
              <small>First name and initial works best, like “Kevin O.”</small>
            </label>
            <label className="field">
              <span>County (optional)</span>
              <select className="select" value={county} disabled={!showCounty} onChange={e => setCounty(e.target.value)}>
                {KENYA_COUNTIES.map(c => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="checkbox-row">
            <input type="checkbox" checked={showCounty} onChange={e => setShowCounty(e.target.checked)} /> Yes, show my county with my review.
          </label>
          <button className="button-app" disabled={save.isPending || !user.emailVerifiedAt}>
            {save.isPending ? "Submitting…" : data ? "Save changes" : "Submit review"} <ArrowRight size={14} />
          </button>
          <p className="small-muted">Your email and phone number are never shown. Reviews appear only after approval.</p>
        </form>
        <aside className="surface surface-pad review-preview-wrap">
          <h2 className="surface-title">Preview</h2>
          <article className="review-card-public">
            <span className="review-stars" aria-label={`${rating} out of 5 stars`}>
              {"★".repeat(rating)}
              <i>{"★".repeat(5 - rating)}</i>
            </span>
            <blockquote>“{content || toneExamples[1]}”</blockquote>
            <div className="review-person">
              <span className="review-avatar">{(displayName || "K").slice(0, 1).toUpperCase()}</span>
              <span>
                <b>{displayName || "Your name"}</b>
                {showCounty && <small>{county} County</small>}
              </span>
            </div>
          </article>
          <p className="small-muted" style={{ marginTop: 12 }}>Need ideas? Talk about how easy it was to sign up, find tasks, track your earnings or use KaziFlow on your phone.</p>
        </aside>
      </div>
    </>
  );
}
