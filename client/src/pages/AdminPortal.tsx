import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  Activity,
  BadgeCheck,
  Bell,
  BriefcaseBusiness,
  Check,
  CircleDollarSign,
  Eye,
  FileCheck2,
  History,
  Home,
  LogOut,
  MessageSquareText,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  WalletCards,
  X,
  Megaphone,
  Mail,
  Store,
  Menu,
} from "lucide-react";
import { TASK_CATEGORIES, TASK_GROUPS, categoryLabel } from "@shared/taskCategories";
import { AdvertisersAdmin, AnnouncementsAdmin, EmailsAdmin, fromLocalInput, toLocalInput } from "./AdminExtras";
import { Wordmark } from "../components/Brand";
import { UserHistoryModal } from "../components/UserHistoryModal";
import { useTheme } from "../contexts/ThemeContext";
import { trpc } from "../lib/trpc";
import { formatKes } from "../lib/format";

const tabs = [
  ["overview", "Overview", Home],
  ["users", "Members", Users],
  ["advertisers", "Advertisers", Store],
  ["tasks", "Tasks", BriefcaseBusiness],
  ["task-review", "Task review", FileCheck2],
  ["wa-review", "WhatsApp evidence", Eye],
  ["campaigns", "Ad campaigns", Activity],
  ["payments", "M-Pesa payments", CircleDollarSign],
  ["withdrawals", "Withdrawals", WalletCards],
  ["announcements", "Announcements", Megaphone],
  ["emails", "Emails", Mail],
  ["support", "Support inbox", MessageSquareText],
  ["reviews", "Member reviews", BadgeCheck],
  ["settings", "Platform settings", Settings],
  ["administrators", "Administrators", ShieldCheck],
  ["audit", "Audit history", History],
] as const;
type Tab = (typeof tabs)[number][0];
type User = {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  accountType: string;
  role: string;
  activatedAt?: Date | null;
  suspendedAt?: Date | null;
  mpesaPhone?: string | null;
  referralCode?: string | null;
};
const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : "Please try again.";
const date = (v: unknown) => {
  const d = new Date(String(v));
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });
};

export default function AdminPortal({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [location] = useLocation();
  const [tab, setTab] = useState<Tab>(() => {
    const value = new URLSearchParams(window.location.search).get(
      "tab"
    ) as Tab | null;
    return tabs.some(item => item[0] === value) ? value! : "overview";
  });
  const theme = useTheme();
  const utils = trpc.useUtils();
  const announce = trpc.auth.status.useQuery();
  const overview = trpc.admin.overview.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewRating, setReviewRating] = useState<number | undefined>();
  const [userType, setUserType] = useState<"all" | "member" | "advertiser">("all");
  const [userState, setUserState] = useState<"all" | "unverified" | "not_activated" | "activated" | "suspended">("all");
  const [subStatus, setSubStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [wdStatus, setWdStatus] = useState<"" | "pending" | "processing" | "paid" | "payout_failed" | "rejected">("");
  const [reviewStatus, setReviewStatus] = useState<"pending" | "approved" | "rejected" | "removed" | "all">("pending");
  const usersQuery = trpc.admin.users.useQuery(
    { query: search || undefined, accountType: userType, state: userState },
    { enabled: tab === "users" }
  );
  const tasksQuery = trpc.admin.tasks.useQuery(undefined, {
    enabled: tab === "tasks",
  });
  const taskSubmissions = trpc.admin.taskSubmissions.useQuery(
    { status: subStatus },
    { enabled: tab === "task-review" }
  );
  const waSubmissions = trpc.admin.whatsappSubmissions.useQuery(
    { status: "pending" },
    { enabled: tab === "wa-review" }
  );
  const campaigns = trpc.admin.campaigns.useQuery(undefined, {
    enabled: tab === "campaigns",
  });
  const payments = trpc.admin.payments.useQuery(undefined, {
    enabled: tab === "payments",
  });
  const withdrawals = trpc.admin.withdrawals.useQuery(wdStatus ? { status: wdStatus } : undefined, {
    enabled: tab === "withdrawals",
  });
  const tickets = trpc.admin.supportTickets.useQuery(
    { status: "open" },
    { enabled: tab === "support" }
  );
  const reviewQueue = trpc.reviews.adminList.useQuery(
    { status: reviewStatus, query: reviewSearch || undefined, rating: reviewRating },
    { enabled: tab === "reviews" }
  );
  const userHistory = trpc.admin.userHistory.useQuery(
    { userId: selectedUserId ?? 1 },
    { enabled: tab === "users" && selectedUserId !== null }
  );
  const settings = trpc.admin.settings.useQuery(undefined, {
    enabled: tab === "settings",
  });
  const admins = trpc.admin.administrators.useQuery(undefined, {
    enabled: tab === "administrators" && user.role === "super_admin",
  });
  const audit = trpc.admin.auditEvents.useQuery(undefined, {
    enabled: tab === "audit",
  });
  const suspend = trpc.admin.setSuspended.useMutation({
    onSuccess: async () => {
      toast.success("Account status updated.");
      await utils.admin.users.invalidate();
    },
  });
  const roleAccess = trpc.admin.setAdministratorAccess.useMutation({
    onSuccess: async () => {
      toast.success(
        "Administrator permissions updated; account sessions were invalidated."
      );
      await Promise.all([
        utils.admin.administrators.invalidate(),
        utils.admin.users.invalidate(),
      ]);
    },
  });
  const reviewTask = trpc.admin.reviewTaskSubmission.useMutation({
    onSuccess: async () => {
      toast.success("Task submission reviewed.");
      await Promise.all([
        utils.admin.taskSubmissions.invalidate(),
        utils.admin.overview.invalidate(),
      ]);
    },
  });
  const reviewAd = trpc.admin.reviewWhatsappSubmission.useMutation({
    onSuccess: async result => {
      toast.success(
        `Evidence reviewed; ${result.eligibleViews.toLocaleString()} eligible view(s), ${formatKes(result.rewardMinor)} credited if approved.`
      );
      await Promise.all([
        utils.admin.whatsappSubmissions.invalidate(),
        utils.admin.overview.invalidate(),
        utils.member.wallet.invalidate(),
      ]);
    },
  });
  const campaignUpdate = trpc.admin.reviewCampaign.useMutation({
    onSuccess: async () => {
      toast.success("Campaign status updated.");
      await Promise.all([
        utils.admin.campaigns.invalidate(),
        utils.admin.overview.invalidate(),
      ]);
    },
  });
  const paymentNote = trpc.admin.investigatePayment.useMutation({
    onSuccess: async () => {
      toast.success(
        "Investigation note recorded; payment status was not changed."
      );
      await utils.admin.payments.invalidate();
    },
  });
  const wdDone = async (msg: string) => {
    toast.success(msg);
    await Promise.all([utils.admin.withdrawals.invalidate(), utils.admin.overview.invalidate()]);
  };
  const payWithdrawal = trpc.admin.payWithdrawal.useMutation({ onSuccess: () => wdDone("Payout sent to M-Pesa. Waiting for Safaricom's confirmation."), onError: e => toast.error(e.message) });
  const rejectWithdrawal = trpc.admin.rejectWithdrawal.useMutation({ onSuccess: () => wdDone("Withdrawal rejected and funds returned."), onError: e => toast.error(e.message) });
  const failWithdrawal = trpc.admin.markPayoutFailed.useMutation({ onSuccess: () => wdDone("Marked as payout failed."), onError: e => toast.error(e.message) });
  const setTaskStatus = trpc.admin.setTaskStatus.useMutation({ onSuccess: async () => { toast.success("Task status updated."); await utils.admin.tasks.invalidate(); }, onError: e => toast.error(e.message) });
  const supportReply = trpc.admin.respondSupportTicket.useMutation({
    onSuccess: async () => {
      toast.success("Support response saved.");
      await utils.admin.supportTickets.invalidate();
    },
  });
  const moderateReview = trpc.reviews.moderate.useMutation({
    onSuccess: async () => {
      toast.success("Member review moderated.");
      await Promise.all([
        utils.reviews.adminList.invalidate(),
        utils.reviews.publicApproved.invalidate(),
      ]);
    },
  });
  const removeReview = trpc.reviews.delete.useMutation({
    onSuccess: async () => {
      toast.success("Review removed from public display.");
      await Promise.all([
        utils.reviews.adminList.invalidate(),
        utils.reviews.publicApproved.invalidate(),
      ]);
    },
  });
  const settingUpdate = trpc.admin.updateSettings.useMutation({
    onSuccess: async () => {
      toast.success("Platform settings saved.");
      await utils.admin.settings.invalidate();
    },
  });
  const [editorKey, setEditorKey] = useState(0);
  const createTask = trpc.admin.createTask.useMutation({
    onSuccess: async () => {
      setEditorKey(k => k + 1);
      toast.success("Task saved to the marketplace.");
      await Promise.all([
        utils.admin.tasks.invalidate(),
        utils.admin.overview.invalidate(),
      ]);
    },
    onError: e => toast.error(e.message),
  });
  const editTask = trpc.admin.updateTask.useMutation({
    onSuccess: async () => {
      toast.success("Task updated.");
      await utils.admin.tasks.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const archiveTask = trpc.admin.deleteTask.useMutation({
    onSuccess: async r => {
      toast.success(r.deleted ? "Task deleted." : "Task has submissions, so it was closed instead (history kept).");
      await utils.admin.tasks.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const isSuper = user.role === "super_admin";
  const ov = overview.data;
  const switchTab = (newTab: Tab) => {
    setTab(newTab);
    window.history.replaceState({}, "", `/admin?tab=${newTab}`);
  };
  const tabLabel = tabs.find(item => item[0] === tab)?.[1] ?? "Overview";
  const [menuOpen, setMenuOpen] = useState(false);

  const render = () => {
    if (tab === "overview")
      return (
        <>
          <Intro
            title="Operations overview."
            subtitle="Live counts from KaziFlow records. No sample users, payments or balances are seeded."
          />
          <div className="dashboard-grid">
            <Metric label="Members" value={ov?.members} />
            <Metric label="Verified emails" value={ov?.verifiedUsers} />
            <Metric label="Activated members" value={ov?.activatedUsers} />
            <Metric label="Advertisers" value={ov?.advertisers} />
            <Metric label="Active tasks" value={ov?.activeTasks} />
            <Metric label="Tasks to review" value={ov?.pendingTaskSubmissions} />
            <Metric label="WhatsApp evidence to review" value={ov?.pendingWhatsAppReviews} />
            <Metric label="Active campaigns" value={ov?.activeCampaigns} />
            <Metric label="Pending withdrawals" value={ov?.pendingWithdrawals} />
            <Metric label="Failed payouts" value={ov?.failedPayouts} />
            <Metric label="Payments to investigate" value={ov?.paymentsToInvestigate} />
            <Metric label="Reviews to moderate" value={ov?.pendingReviews} />
          </div>
          <div className="dashboard-grid">
            <MoneyMetric label="Activation fees received" value={ov?.activationRevenueMinor} />
            <MoneyMetric label="Campaign funding received" value={ov?.campaignFundingMinor} />
            <MoneyMetric label="Rewards credited to members" value={ov?.creditedMinor} />
            <MoneyMetric label="Paid out to M-Pesa" value={ov?.paidOutMinor} />
          </div>
          <section className="surface surface-pad">
            <h2 className="surface-title">Operational guardrails</h2>
            <ul className="check-list">
              <li>
                Activation depends on STK callback and server-side Daraja query
                verification.
              </li>
              <li>
                Member-submitted Status screenshots are not independent
                verification of every viewer.
              </li>
              <li>
                Withdrawals become Paid only from Safaricom's B2C result
                callback, with amount, phone and receipt matched.
              </li>
              <li>
                Actions that change permissions, campaign spend, reviews or
                money movement are audited.
              </li>
            </ul>
          </section>
        </>
      );
    if (tab === "users")
      return (
        <>
          <Intro
            title="Accounts & access."
            subtitle="Search members and advertisers, suspend accounts or inspect activation status."
          />
          <div className="filter-row">
            <label className="search-input">
              <Search size={15} />
              <input
                aria-label="Search users"
                placeholder="Search name, email or phone"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </label>
            <select className="select select-compact" aria-label="Account type" value={userType} onChange={e => setUserType(e.target.value as any)}>
              <option value="all">All accounts</option>
              <option value="member">Members</option>
              <option value="advertiser">Advertisers</option>
            </select>
            <select className="select select-compact" aria-label="Account state" value={userState} onChange={e => setUserState(e.target.value as any)}>
              <option value="all">Any status</option>
              <option value="unverified">Email not verified</option>
              <option value="not_activated">Verified, not activated</option>
              <option value="activated">Activated</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <section className="surface surface-pad">
            {usersQuery.isLoading ? (
              <p className="muted">Loading accounts…</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Type / role</th>
                      <th>Activation</th>
                      <th>M-Pesa</th>
                      <th>Joined</th>
                      <th>Access</th>
                      <th>History</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(usersQuery.data ?? []).map((row: any) => (
                      <tr key={row.id}>
                        <td>
                          <b>{row.name ?? "—"}</b>
                          <small className="table-subline">
                            {row.email} · {row.phone}
                          </small>
                        </td>
                        <td>
                          {row.accountType} · {row.role}
                        </td>
                        <td>
                          <Badge
                            value={row.suspendedAt ? "suspended" : row.activatedAt ? "activated" : row.emailVerifiedAt ? "not_activated" : "unverified"}
                          />
                        </td>
                        <td>{row.mpesaPhone ?? "—"}</td>
                        <td>{date(row.createdAt)}</td>
                        <td>
                          {row.role === "super_admin" ? (
                            <span className="badge">
                              Primary admin protected
                            </span>
                          ) : (
                            <button
                              className={`button-app ${row.suspendedAt ? "secondary" : "danger"}`}
                              disabled={
                                suspend.isPending ||
                                (row.role === "admin" && !isSuper)
                              }
                              onClick={() =>
                                suspend.mutate({
                                  userId: row.id,
                                  suspended: !row.suspendedAt,
                                })
                              }
                            >
                              {row.suspendedAt ? "Restore" : "Suspend"}
                            </button>
                          )}
                          {isSuper &&
                            row.role !== "admin" &&
                            row.role !== "super_admin" && (
                              <button
                                className="button-app secondary"
                                style={{ marginLeft: 5 }}
                                disabled={roleAccess.isPending}
                                onClick={() =>
                                  roleAccess.mutate({
                                    userId: row.id,
                                    grant: true,
                                  })
                                }
                              >
                                Grant admin
                              </button>
                            )}
                        </td>
                        <td>
                          <button
                            className="button-app secondary"
                            onClick={() => setSelectedUserId(row.id)}
                          >
                            View history
                          </button>
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
    if (tab === "tasks")
      return (
        <>
          <Intro
            title="Task marketplace."
            subtitle="Create, edit, pause or archive approved activities. Rewards and slot capacity cannot exceed each task's configured budget."
          />
          <AdminTaskEditor
            key={editorKey}
            create={(v: any) => createTask.mutate(v)}
            createBusy={createTask.isPending}
          />
          <section className="surface surface-pad" style={{ marginTop: 14 }}>
            <h2 className="surface-title">Published and archived tasks</h2>
            {tasksQuery.isLoading ? (
              <p className="muted">Loading tasks…</p>
            ) : (tasksQuery.data?.length ?? 0) === 0 ? (
              <Empty title="No tasks have been created" />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Category</th>
                      <th>Reward</th>
                      <th>Budget / spend</th>
                      <th>Slots</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tasksQuery.data ?? []).map((row: any) => (
                      <tr key={row.id}>
                        <td>
                          <b>{row.title}</b>
                          <small className="table-subline">
                            {row.description}
                          </small>
                        </td>
                        <td>{categoryLabel(row.category)}</td>
                        <td>{formatKes(row.rewardMinor)}</td>
                        <td>
                          {formatKes(row.budgetMinor)} /{" "}
                          {formatKes(row.spentMinor)}
                        </td>
                        <td>
                          {row.slotsTaken}/{row.slotLimit}
                        </td>
                        <td>
                          <Badge value={row.status} />
                        </td>
                        <td>
                          <div className="button-row">
                            <AdminTaskEditor
                              inline
                              initial={row}
                              update={(v: any) => editTask.mutate(v)}
                              updateBusy={editTask.isPending}
                            />
                            {row.status === "active" ? (
                              <button className="button-app secondary" onClick={() => setTaskStatus.mutate({ id: row.id, status: "paused" })}>
                                Suspend
                              </button>
                            ) : row.status !== "closed" ? (
                              <button className="button-app secondary" onClick={() => setTaskStatus.mutate({ id: row.id, status: "active" })}>
                                Activate
                              </button>
                            ) : null}
                            <button
                              className="button-app danger"
                              onClick={() => {
                                if (window.confirm("Delete this task? If members already submitted it, it will be closed instead.")) archiveTask.mutate({ id: row.id });
                              }}
                            >
                              Delete
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
    if (tab === "task-review")
      return (
        <>
          <Intro
            title="Task submission review."
            subtitle="Approve only after checking the proof. Each submission can be credited once; rejections free the slot and email the member."
          />
          <div className="filter-row">
            {(["pending", "approved", "rejected"] as const).map(v => (
              <button key={v} type="button" className={`filter-pill ${subStatus === v ? "active" : ""}`} onClick={() => setSubStatus(v)}>
                {v[0]!.toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          {taskSubmissions.isLoading ? (
            <p className="muted">Loading queue…</p>
          ) : !taskSubmissions.data?.length ? (
            <Empty
              title={subStatus === "pending" ? "Task queue clear" : `No ${subStatus} submissions`}
              text={subStatus === "pending" ? "There are no pending submissions." : undefined}
            />
          ) : (
            <div className="review-queue">
              {taskSubmissions.data.map((row: any) => (
                <TaskReviewCard
                  key={row.submission.id}
                  row={row}
                  onReview={(decision, note) =>
                    reviewTask.mutate({
                      submissionId: row.submission.id,
                      decision,
                      note,
                    })
                  }
                  busy={reviewTask.isPending}
                />
              ))}
            </div>
          )}
        </>
      );
    if (tab === "wa-review")
      return (
        <>
          <Intro
            title="WhatsApp Status Ad evidence."
            subtitle="Compare both submitted screenshots; enter the eligible view count to pay. Screenshots remain member-submitted evidence, not independent viewer verification."
          />
          {waSubmissions.isLoading ? (
            <p className="muted">Loading queue…</p>
          ) : !waSubmissions.data?.length ? (
            <Empty
              title="WhatsApp evidence queue clear"
              text="No pending campaign submissions need review."
            />
          ) : (
            <div className="review-queue">
              {waSubmissions.data.map((row: any) => (
                <WhatsAppReviewCard
                  key={row.submission.id}
                  row={row}
                  onReview={(decision, eligibleViews, note) =>
                    reviewAd.mutate({
                      submissionId: row.submission.id,
                      decision,
                      eligibleViews,
                      note,
                    })
                  }
                  busy={reviewAd.isPending}
                />
              ))}
            </div>
          )}
        </>
      );
    if (tab === "campaigns")
      return (
        <>
          <Intro
            title="Advertiser campaign control."
            subtitle="Funding must be confirmed before campaign approval. Approved participant evidence and spend are visible from the member reports."
          />
          <section className="surface surface-pad">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Advertiser</th>
                    <th>Funded / budget</th>
                    <th>Spent</th>
                    <th>Participants</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th>Change status</th>
                  </tr>
                </thead>
                <tbody>
                  {(campaigns.data ?? []).map((row: any) => (
                    <tr key={row.id}>
                      <td>
                        <b>{row.title}</b>
                        <small className="table-subline">
                          {row.reference} · {formatKes(row.rateMinor)} / view ·
                          cap {row.maximumPayableViews.toLocaleString()}
                        </small>
                      </td>
                      <td>
                        {row.advertiserName} (#{row.advertiserId})
                      </td>
                      <td>
                        {formatKes(row.fundedMinor)} /{" "}
                        {formatKes(row.budgetMinor)}
                      </td>
                      <td>{formatKes(row.spentMinor)}</td>
                      <td>{row.participantLimit}</td>
                      <td>{row.durationDays} days</td>
                      <td>
                        <Badge value={row.status} />
                      </td>
                      <td>
                        <select
                          className="select select-compact"
                          value={row.status}
                          onChange={e =>
                            campaignUpdate.mutate({
                              campaignId: row.id,
                              decision: e.target.value as any,
                            })
                          }
                        >
                          <option value="pending_funding">
                            Pending funding
                          </option>
                          <option value="pending_review">Pending review</option>
                          <option
                            value="active"
                            disabled={row.fundedMinor < row.budgetMinor}
                          >
                            Activate (funded)
                          </option>
                          <option value="paused">Pause</option>
                          <option value="closed">Close</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small-muted">
              Create or upload an admin-run campaign using the advertiser
              workspace. Upload and funding remain subject to the same
              ownership, Daraja and budget checks.
            </p>
            <Link href="/advertiser" className="button-app secondary">
              Open advertiser campaign tools
            </Link>
          </section>
        </>
      );
    if (tab === "payments")
      return (
        <>
          <Intro
            title="Safaricom M-Pesa transactions."
            subtitle="Provider response and checkout references are visible for investigation. Adding an internal note does not change payment or activation status."
          />
          {payments.isLoading ? (
            <p className="muted">Loading transactions…</p>
          ) : !payments.data?.length ? (
            <Empty
              title="No M-Pesa attempts recorded"
              text="No sample transactions are seeded."
            />
          ) : (
            <section className="surface surface-pad">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Purpose / account</th>
                      <th>Amount / phone</th>
                      <th>Status</th>
                      <th>Checkout / receipt</th>
                      <th>Provider result</th>
                      <th>Investigation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.data.map((row: any) => {
                      const payment = row.payment;
                      return (
                        <tr key={payment.id}>
                          <td>
                            {payment.purpose}
                            <small className="table-subline">
                              {row.userName} · {row.email} · #{payment.id}
                            </small>
                          </td>
                          <td>
                            {formatKes(payment.amountMinor)}
                            <small className="table-subline">
                              {payment.phone}
                            </small>
                          </td>
                          <td>
                            <Badge value={payment.status} />
                          </td>
                          <td>
                            {payment.checkoutRequestId ??
                              payment.merchantRequestId ??
                              "—"}
                            <small className="table-subline">
                              Receipt: {payment.receipt ?? "not recorded"}
                            </small>
                          </td>
                          <td>
                            {payment.resultDescription ??
                              "Awaiting provider result"}
                            <small className="table-subline">
                              Code: {payment.resultCode ?? "—"}
                            </small>
                          </td>
                          <td>
                            <span>{payment.adminNote ?? "No note"}</span>
                            <button
                              className="button-app secondary"
                              onClick={() => {
                                const note = window.prompt(
                                  "Add an internal investigation note. This will not change payment status or credit a wallet:",
                                  payment.adminNote ?? ""
                                );
                                if (note?.trim())
                                  paymentNote.mutate({
                                    paymentId: payment.id,
                                    note,
                                  });
                              }}
                            >
                              Add note
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      );
    if (tab === "withdrawals")
      return (
        <>
          <Intro
            title="M-Pesa withdrawal requests."
            subtitle="Approve to send via M-Pesa B2C, or reject with a reason (funds return to the member). Paid is set only when Safaricom confirms the payout."
          />
          <div className="filter-row">
            {(["", "pending", "processing", "payout_failed", "paid", "rejected"] as const).map(v => (
              <button key={v || "all"} type="button" className={`filter-pill ${wdStatus === v ? "active" : ""}`} onClick={() => setWdStatus(v)}>
                {v ? v.replaceAll("_", " ") : "All"}
              </button>
            ))}
          </div>
          {withdrawals.isLoading ? (
            <p className="muted">Loading requests…</p>
          ) : !withdrawals.data?.rows.length ? (
            <Empty title="No withdrawal requests" text="Nothing matches this filter." />
          ) : (
            <div className="withdrawal-admin-list">
              {withdrawals.data.rows.map((row: any) => (
                <AdminWithdrawal
                  key={row.withdrawal.id}
                  row={row}
                  b2c={withdrawals.data!.b2cReady}
                  onPay={() => payWithdrawal.mutate({ id: row.withdrawal.id })}
                  onReject={note => rejectWithdrawal.mutate({ id: row.withdrawal.id, note })}
                  onFail={note => failWithdrawal.mutate({ id: row.withdrawal.id, note })}
                  busy={payWithdrawal.isPending || rejectWithdrawal.isPending || failWithdrawal.isPending}
                />
              ))}
            </div>
          )}
        </>
      );
    if (tab === "advertisers")
      return (
        <>
          <Intro title="Advertisers." subtitle="Advertiser accounts, their campaigns, confirmed funding and approved spend." />
          <AdvertisersAdmin onSuspend={(userId, suspended) => suspend.mutate({ userId, suspended }, { onSuccess: () => void utils.admin.advertisers.invalidate() })} />
        </>
      );
    if (tab === "announcements")
      return (
        <>
          <Intro title="Announcements & push ads." subtitle="Create dismissible popups for members with optional image/video, link, schedule and audience. Impressions and clicks are counted once per member." />
          <AnnouncementsAdmin />
        </>
      );
    if (tab === "emails")
      return (
        <>
          <Intro title="Emails." subtitle="Brevo transactional emails and important announcements." />
          <EmailsAdmin />
        </>
      );
    if (tab === "support")
      return (
        <>
          <Intro
            title="Member support inbox."
            subtitle="Responses are saved to the member’s private support record; no external email delivery is assumed."
          />
          {tickets.isLoading ? (
            <p className="muted">Loading requests…</p>
          ) : !tickets.data?.length ? (
            <Empty
              title="No open requests"
              text="Support requests will appear when members submit them."
            />
          ) : (
            <div className="support-admin-list">
              {tickets.data.map((row: any) => (
                <SupportAdminCard
                  key={row.ticket.id}
                  row={row}
                  onReply={(reply, status) =>
                    supportReply.mutate({
                      ticketId: row.ticket.id,
                      reply,
                      status,
                    })
                  }
                  busy={supportReply.isPending}
                />
              ))}
            </div>
          )}
        </>
      );
    if (tab === "reviews")
      return (
        <>
          <Intro
            title="Member review moderation."
            subtitle="Reviews stay private until approved. Only approved reviews appear on the homepage, with the member's chosen display name."
          />
          <div className="filter-row">
            {(["pending", "approved", "rejected", "removed", "all"] as const).map(v => (
              <button key={v} type="button" className={`filter-pill ${reviewStatus === v ? "active" : ""}`} onClick={() => setReviewStatus(v)}>
                {v[0]!.toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <div className="filter-row">
            <label className="search-input">
              <Search size={15} />
              <input
                aria-label="Search reviews by member or text"
                placeholder="Search review text, member or email"
                value={reviewSearch}
                onChange={e => setReviewSearch(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="sr-only">Filter by rating</span>
              <select
                className="select"
                aria-label="Filter reviews by star rating"
                value={reviewRating ?? ""}
                onChange={e =>
                  setReviewRating(e.target.value ? Number(e.target.value) : undefined)
                }
              >
                <option value="">All ratings</option>
                {[5, 4, 3, 2, 1].map(rating => (
                  <option value={rating} key={rating}>
                    {rating} star{rating === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {reviewQueue.isLoading ? (
            <p className="muted">Loading reviews…</p>
          ) : !reviewQueue.data?.length ? (
            <Empty
              title="Nothing here"
              text="No reviews match this filter."
            />
          ) : (
            <div className="review-queue">
              {reviewQueue.data.map((row: any) => (
                <ReviewCard
                  key={row.id}
                  row={row}
                  onModerate={(status, note) =>
                    moderateReview.mutate({ reviewId: row.id, status, note })
                  }
                  onDelete={note =>
                    removeReview.mutate({ reviewId: row.id, note })
                  }
                  busy={moderateReview.isPending || removeReview.isPending}
                />
              ))}
            </div>
          )}
        </>
      );
    if (tab === "settings")
      return (
        <>
          <Intro
            title="Platform rules & limits."
            subtitle="These server-side settings control activation fee, referral commissions, withdrawals, advertising limits and member announcements."
          />
          {settings.data && (
            <SettingsForm
              initial={settings.data}
              busy={settingUpdate.isPending}
              onSave={(v: any) => settingUpdate.mutate(v)}
            />
          )}
          <section className="surface surface-pad" style={{ marginTop: 14 }}>
            <h2 className="surface-title">Configured integration status</h2>
            <div className="integration-status">
              <span>
                Safaricom Daraja{" "}
                <Badge
                  value={
                    announce.data?.darajaReady ? "configured" : "setup_required"
                  }
                />
              </span>
              <span>
                Email delivery{" "}
                <Badge
                  value={
                    announce.data?.mailerReady ? "configured" : "not_configured"
                  }
                />
              </span>
              <span>
                M-Pesa B2C payouts <Badge value={ov?.integrations.b2c ? "configured" : "not_configured"} />
              </span>
              <span>
                File storage <Badge value={ov?.integrations.storage === "s3" ? "s3_storage" : "local_disk"} />
              </span>
              <span>
                Application session{" "}
                <Badge
                  value={
                    announce.data?.sessionReady ? "ready" : "not_configured"
                  }
                />
              </span>
            </div>
            <p className="small-muted">
              No credentials are displayed here. Never paste provider secrets
              into support messages or browser code.
            </p>
          </section>
        </>
      );
    if (tab === "administrators")
      return !isSuper ? (
        <div className="notice">
          <ShieldCheck size={16} />
          <span>
            <strong>Primary administrator only</strong>Delegated admin accounts
            cannot grant or revoke administrator access.
          </span>
        </div>
      ) : (
        <>
          <Intro
            title="Delegated administrator access."
            subtitle="Only the configured primary super-administrator can grant or revoke ordinary administrator access. Changes invalidate active sessions."
          />
          {admins.isLoading ? (
            <p className="muted">Loading administrators…</p>
          ) : (
            <section className="surface surface-pad">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Administrator</th>
                      <th>Role</th>
                      <th>Joined</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admins.data?.map((row: any) => (
                      <tr key={row.id}>
                        <td>
                          {row.name}
                          <small className="table-subline">{row.email}</small>
                        </td>
                        <td>{row.role}</td>
                        <td>{date(row.createdAt)}</td>
                        <td>
                          {row.role === "super_admin" ? (
                            <span className="badge">Primary protected</span>
                          ) : (
                            <button
                              className="button-app danger"
                              onClick={() =>
                                roleAccess.mutate({
                                  userId: row.id,
                                  grant: false,
                                })
                              }
                            >
                              Revoke admin
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      );
    if (tab === "audit")
      return (
        <>
          <Intro
            title="Administrator audit history."
            subtitle="Role changes, task decisions, evidence approvals, payment notes, payout status, settings and support actions are retained."
          />
          {audit.isLoading ? (
            <p className="muted">Loading audit history…</p>
          ) : !audit.data?.length ? (
            <Empty title="No administrator events yet" />
          ) : (
            <section className="surface surface-pad">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Actor ID</th>
                      <th>Action</th>
                      <th>Record</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.data.map((row: any) => (
                      <tr key={row.id}>
                        <td>{date(row.createdAt)}</td>
                        <td>{row.actorId ?? "System"}</td>
                        <td>{row.action}</td>
                        <td>
                          {row.targetType} #{row.targetId ?? "—"}
                        </td>
                        <td className="audit-details">
                          {row.detailsText ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      );
    return null;
  };

  const visibleTabs = tabs.filter(
    item => item[0] !== "administrators" || isSuper
  );
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Wordmark />
        <p className="sidebar-label">Administration</p>
        <nav className="app-nav">
          {visibleTabs.map(([key, label, Icon]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => switchTab(key)}
            >
              <Icon />
              <span>{label}</span>
              {(() => {
                const n = key === "wa-review" ? ov?.pendingWhatsAppReviews : key === "task-review" ? ov?.pendingTaskSubmissions : key === "withdrawals" ? ov?.pendingWithdrawals : key === "reviews" ? ov?.pendingReviews : key === "support" ? ov?.openTickets : 0;
                return n ? <i className="nav-count">{n}</i> : null;
              })()}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <Link href="/advertiser" className="app-nav-link">
          <BriefcaseBusiness size={16} />
          Advertiser tools
        </Link>
        <div className="sidebar-user">
          <div className="user-avatar">
            {(user.name ?? "A").slice(0, 1).toUpperCase()}
          </div>
          <span>
            <b>{user.name ?? "Administrator"}</b>
            <small>
              {user.role === "super_admin"
                ? "Primary super-admin"
                : "Administrator"}
            </small>
          </span>
          <button className="topbar-icon" onClick={onLogout} title="Sign out">
            <LogOut size={15} />
          </button>
        </div>
      </aside>
      <div className="app-main">
        <div className="app-mobile-head">
          <Wordmark />
          <button className="topbar-icon" aria-label="Open admin menu" onClick={() => setMenuOpen(true)}>
            <Menu size={16} />
          </button>
        </div>
        {menuOpen && (
          <div className="mobile-menu-backdrop" onClick={() => setMenuOpen(false)}>
            <nav className="mobile-menu" aria-label="Admin menu" onClick={e => e.stopPropagation()}>
              <div className="section-line">
                <b>Administration</b>
                <button className="topbar-icon" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                  <X size={16} />
                </button>
              </div>
              {visibleTabs.map(([key, label, Icon]) => (
                <button key={key} className={tab === key ? "active" : ""} onClick={() => { switchTab(key); setMenuOpen(false); }}>
                  <Icon size={17} />
                  <span>{label}</span>
                </button>
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
            KaziFlow control room / {tabLabel}
          </span>
          <div className="app-topbar-actions">
            <span className="badge">{user.role.replaceAll("_", " ")}</span>
            <button
              className="topbar-icon"
              aria-label="Toggle light/dark mode"
              onClick={() => theme.toggleTheme?.()}
            >
              <Sun size={15} />
            </button>
          </div>
        </header>
        <main className="app-content">
          {announce.data?.announcement && (
            <div className="announcement">
              <Bell size={14} style={{ display: "inline", marginRight: 7 }} />
              {announce.data.announcement}
            </div>
          )}
          {render()}
        </main>
      </div>
      <nav className="app-bottom-nav">
        {visibleTabs
          .filter(([key]) =>
            [
              "overview",
              "wa-review",
              "withdrawals",
              "users",
              "settings",
            ].includes(key)
          )
          .map(([key, label, Icon]) => (
            <button
              className={tab === key ? "active" : ""}
              key={key}
              onClick={() => switchTab(key)}
            >
              <Icon />
              <span>{label.split(" ")[0]}</span>
            </button>
          ))}
      </nav>
      {selectedUserId !== null && (
        <UserHistoryModal
          data={userHistory.data}
          loading={userHistory.isLoading}
          error={userHistory.error?.message}
          onClose={() => setSelectedUserId(null)}
        />
      )}
    </div>
  );
}

function Intro({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="page-intro">
      <div>
        <p className="page-eyebrow">KaziFlow operations</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <strong className="metric-value">
        {value === undefined ? "—" : Number(value).toLocaleString()}
      </strong>
    </div>
  );
}
function MoneyMetric({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <strong className="metric-value">{value === undefined ? "—" : formatKes(value)}</strong>
    </div>
  );
}
function Badge({ value }: { value: string }) {
  return (
    <span
      className={`badge ${String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")}`}
    >
      {String(value).replaceAll("_", " ")}
    </span>
  );
}
function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <div className="empty-state">
      <ShieldCheck size={24} />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
    </div>
  );
}

type QuizDraft = { question: string; options: string[]; answerIndex: number };
function AdminTaskEditor({
  initial,
  inline = false,
  create,
  update,
  createBusy = false,
  updateBusy = false,
}: {
  initial?: any;
  inline?: boolean;
  create?: (v: any) => void;
  update?: (v: any) => void;
  createBusy?: boolean;
  updateBusy?: boolean;
}) {
  const [open, setOpen] = useState(!inline);
  const initialQuiz: QuizDraft[] = (() => {
    try {
      return initial?.quizJson ? JSON.parse(initial.quizJson) : [];
    } catch {
      return [];
    }
  })();
  const [form, setForm] = useState<Record<string, string>>({
    category: initial?.category ?? "tiktok",
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    instructions: initial?.instructions ?? "",
    completionRequirements: initial?.completionRequirements ?? "",
    rewardKes: String((initial?.rewardMinor ?? 1000) / 100),
    budgetKes: String((initial?.budgetMinor ?? 100000) / 100),
    estimatedMinutes: String(initial?.estimatedMinutes ?? 5),
    slotLimit: String(initial?.slotLimit ?? 100),
    completionMode: initial?.completionMode ?? "manual",
    externalUrl: initial?.externalUrl ?? "",
    sponsorName: initial?.sponsorName ?? "",
    passMark: String(initial?.passMark ?? 70),
    startsAt: toLocalInput(initial?.startsAt),
    expiresAt: toLocalInput(initial?.expiresAt),
    status: initial?.status ?? "draft",
  });
  const [flags, setFlags] = useState({
    requiresEvidence: Boolean(initial?.requiresEvidence),
    repeatDaily: Boolean(initial?.repeatDaily),
    autoApproveQuiz: Boolean(initial?.autoApproveQuiz),
    featured: Boolean(initial?.featured),
  });
  const uploadImage = trpc.admin.uploadTaskImage.useMutation();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [keepImage, setKeepImage] = useState(Boolean(initial?.imageUrl));
  const [quiz, setQuiz] = useState<QuizDraft[]>(initialQuiz.length ? initialQuiz : [{ question: "", options: ["", ""], answerIndex: 0 }]);
  const put = (k: string, v: string) => setForm(c => ({ ...c, [k]: v }));
  const budgetNeeded = Number(form.rewardKes || 0) * Number(form.slotLimit || 0);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    let imageAssetId: number | null = null;
    if (imageFile) {
      if (imageFile.size > 3 * 1024 * 1024) return void toast.error("The picture must be 3 MB or smaller.");
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
          reader.onerror = () => reject(new Error("Could not read the selected picture."));
          reader.readAsDataURL(imageFile);
        });
        imageAssetId = (await uploadImage.mutateAsync({ mime: imageFile.type as any, base64 })).assetId;
      } catch (error) {
        return void toast.error(error instanceof Error ? error.message : "The picture could not be uploaded.");
      }
    }
    const payload = {
      ...form,
      category: form.category as any,
      completionMode: form.completionMode as any,
      rewardKes: Number(form.rewardKes),
      budgetKes: Number(form.budgetKes),
      estimatedMinutes: Number(form.estimatedMinutes),
      slotLimit: Number(form.slotLimit),
      passMark: Number(form.passMark),
      externalUrl: form.externalUrl!.trim() || undefined,
      sponsorName: form.sponsorName!.trim() || null,
      startsAt: fromLocalInput(form.startsAt!),
      expiresAt: fromLocalInput(form.expiresAt!),
      quizJson: form.completionMode === "quiz" ? JSON.stringify(quiz.map(q => ({ ...q, options: q.options.filter(o => o.trim()) }))) : null,
      status: form.status as any,
      ...flags,
      imageAssetId,
      keepImage: imageAssetId ? undefined : keepImage,
    };
    if (initial?.id) update?.({ id: initial.id, ...payload });
    else create?.(payload);
    setImageFile(null);
    if (inline) setOpen(false);
  };
  return (
    <>
      {inline ? (
        <button className="button-app secondary" onClick={() => setOpen(v => !v)}>
          {open ? "Close" : "Edit"}
        </button>
      ) : (
        <section className="surface surface-pad" style={{ marginTop: 12 }}>
          <div className="section-line">
            <h2 className="surface-title">Create a task</h2>
            <span className="badge">Budget must cover reward × slots</span>
          </div>
          <p className="small-muted">Save as draft first, then set Active when the brief and budget are ready.</p>
        </section>
      )}
      {open && (
        <form className={`admin-task-form ${inline ? "inline-editor" : "surface surface-pad"}`} onSubmit={submit}>
          <div className="field-grid">
            <label className="field">
              <span>Category</span>
              <select className="select" value={form.category} onChange={e => put("category", e.target.value)}>
                {TASK_GROUPS.map(g => (
                  <optgroup key={g.id} label={g.label}>
                    {TASK_CATEGORIES.filter(c => c.group === g.id).map(c => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select className="select" value={form.status} onChange={e => put("status", e.target.value)}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused (suspended)</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <Field form={form} put={put} k="title" label="Task title" required />
            <Field form={form} put={put} k="rewardKes" label="Reward per completion (KES)" type="number" required />
            <Field form={form} put={put} k="slotLimit" label="Available slots" type="number" required />
            <label className="field">
              <span>Total reward budget (KES)</span>
              <input className="input" type="number" required value={form.budgetKes} onChange={e => put("budgetKes", e.target.value)} />
              <small>Needs at least KES {budgetNeeded.toLocaleString()} for all slots.</small>
            </label>
            <Field form={form} put={put} k="estimatedMinutes" label="Estimated completion time (minutes)" type="number" required />
            <label className="field">
              <span>How members complete it</span>
              <select className="select" value={form.completionMode} onChange={e => put("completionMode", e.target.value)}>
                <option value="manual">Written proof (+ optional screenshot)</option>
                <option value="link_visit">Visit a link, then submit proof</option>
                <option value="video_progress">Watch video (full time required)</option>
                <option value="quiz">Quiz / trivia (auto-scored)</option>
              </select>
            </label>
            <Field form={form} put={put} k="externalUrl" label="Task link (https://, optional)" type="url" />
            <Field form={form} put={put} k="sponsorName" label="Sponsor / advertiser name (optional)" />
            <div className="field full">
              <span>Task picture (optional)</span>
              <div className="task-image-field">
                {imageFile ? (
                  <img src={URL.createObjectURL(imageFile)} alt="New task picture" />
                ) : keepImage && initial?.imageUrl ? (
                  <img src={initial.imageUrl} alt="Current task picture" />
                ) : null}
                <input
                  className="input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Task picture"
                  onChange={e => setImageFile(e.target.files?.[0] ?? null)}
                  style={{ maxWidth: 320 }}
                />
                {(imageFile || (keepImage && initial?.imageUrl)) && (
                  <button
                    type="button"
                    className="button-app secondary"
                    onClick={() => {
                      setImageFile(null);
                      setKeepImage(false);
                    }}
                  >
                    Remove picture
                  </button>
                )}
              </div>
              <small>JPEG, PNG or WebP up to 3 MB. Shown on the task card and inside the task.</small>
            </div>
            <label className="field">
              <span>Starts (optional)</span>
              <input className="input" type="datetime-local" value={form.startsAt} onChange={e => put("startsAt", e.target.value)} />
            </label>
            <label className="field">
              <span>Ends (optional, for limited-time tasks)</span>
              <input className="input" type="datetime-local" value={form.expiresAt} onChange={e => put("expiresAt", e.target.value)} />
            </label>
            <label className="field full">
              <span>Description</span>
              <textarea className="textarea" minLength={5} maxLength={5000} required value={form.description} onChange={e => put("description", e.target.value)} />
            </label>
            <label className="field full">
              <span>Instructions (step by step)</span>
              <textarea className="textarea" minLength={3} maxLength={5000} required value={form.instructions} onChange={e => put("instructions", e.target.value)} />
            </label>
            <label className="field full">
              <span>Submission requirements</span>
              <textarea className="textarea" minLength={3} maxLength={3000} required value={form.completionRequirements} onChange={e => put("completionRequirements", e.target.value)} placeholder="e.g. Paste your TikTok username and upload a screenshot showing you followed the account." />
            </label>
          </div>
          <div className="check-grid">
            <label className="checkbox-row">
              <input type="checkbox" checked={flags.requiresEvidence} onChange={e => setFlags({ ...flags, requiresEvidence: e.target.checked })} /> Screenshot evidence required
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={flags.repeatDaily} onChange={e => setFlags({ ...flags, repeatDaily: e.target.checked })} /> Repeat daily (one submission per member per day)
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={flags.featured} onChange={e => setFlags({ ...flags, featured: e.target.checked })} /> Feature at the top
            </label>
          </div>
          {form.completionMode === "quiz" && (
            <div className="quiz-builder">
              <div className="section-line">
                <b>Quiz questions</b>
                <span className="field-inline">
                  Pass mark %
                  <input className="input input-small" type="number" min={1} max={100} value={form.passMark} onChange={e => put("passMark", e.target.value)} />
                </span>
              </div>
              <label className="checkbox-row">
                <input type="checkbox" checked={flags.autoApproveQuiz} onChange={e => setFlags({ ...flags, autoApproveQuiz: e.target.checked })} /> Auto-approve and pay members who reach the pass mark
              </label>
              {quiz.map((q, qi) => (
                <div className="quiz-builder-q" key={qi}>
                  <input className="input" placeholder={`Question ${qi + 1}`} value={q.question} onChange={e => setQuiz(quiz.map((x, i) => (i === qi ? { ...x, question: e.target.value } : x)))} />
                  {q.options.map((o, oi) => (
                    <label className="quiz-builder-option" key={oi}>
                      <input type="radio" name={`ans-${initial?.id ?? "new"}-${qi}`} checked={q.answerIndex === oi} onChange={() => setQuiz(quiz.map((x, i) => (i === qi ? { ...x, answerIndex: oi } : x)))} title="Correct answer" />
                      <input className="input" placeholder={`Option ${oi + 1}`} value={o} onChange={e => setQuiz(quiz.map((x, i) => (i === qi ? { ...x, options: x.options.map((y, j) => (j === oi ? e.target.value : y)) } : x)))} />
                    </label>
                  ))}
                  <div className="button-row">
                    {q.options.length < 6 && (
                      <button type="button" className="button-app secondary" onClick={() => setQuiz(quiz.map((x, i) => (i === qi ? { ...x, options: [...x.options, ""] } : x)))}>
                        + Option
                      </button>
                    )}
                    {quiz.length > 1 && (
                      <button type="button" className="button-app danger" onClick={() => setQuiz(quiz.filter((_, i) => i !== qi))}>
                        Remove question
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button type="button" className="button-app secondary" onClick={() => setQuiz([...quiz, { question: "", options: ["", ""], answerIndex: 0 }])}>
                + Add question
              </button>
              <p className="small-muted">Select the radio button next to the correct answer. Members never see the answers.</p>
            </div>
          )}
          <div className="button-row">
            <button className="button-app" disabled={createBusy || updateBusy || uploadImage.isPending}>
              {initial?.id ? "Save task changes" : "Create task"} <Check size={14} />
            </button>
          </div>
        </form>
      )}
    </>
  );
}
function Field({
  form,
  put,
  k,
  label,
  type = "text",
  required = false,
}: {
  form: any;
  put: (k: string, v: string) => void;
  k: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="input"
        type={type}
        required={required}
        value={form[k]}
        onChange={e => put(k, e.target.value)}
      />
    </label>
  );
}

function TaskReviewCard({
  row,
  onReview,
  busy,
}: {
  row: any;
  onReview: (decision: "approved" | "rejected", note?: string) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  const s = row.submission;
  return (
    <article className="surface surface-pad review-card">
      <div className="section-line">
        <div>
          <p className="page-eyebrow">{row.category ? `${categoryLabel(row.category)} · ` : ""}{row.taskTitle ?? `Task #${s.taskId}`}</p>
          <h2>{row.memberName ?? "Member"}</h2>
          <small className="muted">
            {row.memberEmail} · Submitted{" "}
            {new Date(s.submittedAt).toLocaleString("en-KE")}
          </small>
        </div>
        <strong className="task-reward">{formatKes(s.rewardMinor)}</strong>
      </div>
      <div className="submission-proof">
        <b>Member proof</b>
        {s.quizScore !== null && s.quizScore !== undefined && <p><b>Quiz score: {s.quizScore}%</b></p>}
        <p>{s.proofText ?? "—"}</p>
        {s.periodKey && s.periodKey !== "once" && <small className="muted">Daily task · {s.periodKey}</small>}
        {row.evidenceUrl && (
          <a
            href={row.evidenceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            Open submitted evidence
          </a>
        )}
      </div>
      <label className="field">
        <span>Review note {"(required for rejection)"}</span>
        <textarea
          className="textarea"
          maxLength={3000}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Explain a rejection or add an approval note."
        />
      </label>
      <div className="button-row">
        {s.status === "pending" ? (
          <>
            <button className="button-app" disabled={busy} onClick={() => onReview("approved", note || undefined)}>
              Approve & credit {formatKes(s.rewardMinor)}
            </button>
            <button className="button-app danger" disabled={busy || !note.trim()} onClick={() => onReview("rejected", note)}>
              Reject with reason
            </button>
          </>
        ) : (
          <span className="muted">
            <Badge value={s.status} /> {s.reviewNote}
          </span>
        )}
      </div>
    </article>
  );
}

function WhatsAppReviewCard({
  row,
  onReview,
  busy,
}: {
  row: any;
  onReview: (
    decision: "approved" | "rejected",
    eligibleViews: number,
    note?: string
  ) => void;
  busy: boolean;
}) {
  const s = row.submission;
  const campaign = row.campaign;
  const [views, setViews] = useState(String(s.reportedViews));
  const [note, setNote] = useState("");
  return (
    <article className="surface surface-pad review-card">
      <div className="section-line">
        <div>
          <p className="page-eyebrow">
            {campaign?.title ?? `Campaign #${s.campaignId}`} ·{" "}
            {s.campaignReference}
          </p>
          <h2>{row.member?.name ?? "Member"}</h2>
          <small className="muted">
            Reported {s.reportedViews.toLocaleString()} views · Posted{" "}
            {new Date(s.postedAt).toLocaleString("en-KE")} · Submitted{" "}
            {new Date(s.submittedAt).toLocaleString("en-KE")}
          </small>
        </div>
        <Badge value={s.status} />
      </div>
      <div className="evidence-pair">
        <figure>
          <a href={row.statusScreenshotUrl} target="_blank" rel="noreferrer">
            <img
              src={row.statusScreenshotUrl}
              alt="Member-submitted WhatsApp status screenshot"
            />
          </a>
          <figcaption>Status screenshot · member-submitted</figcaption>
        </figure>
        <figure>
          <a href={row.insightsScreenshotUrl} target="_blank" rel="noreferrer">
            <img
              src={row.insightsScreenshotUrl}
              alt="Member-submitted WhatsApp views insights screenshot"
            />
          </a>
          <figcaption>
            Insights screenshot · not independent verification
          </figcaption>
        </figure>
      </div>
      <div className="notice">
        <Eye size={15} />
        <span>
          Review screenshots as evidence only. Do not describe this count as
          independent verification of every viewer. Campaign minimum{" "}
          {campaign?.minimumViews}; rate {formatKes(campaign?.rateMinor ?? 0)} /
          approved view; cap {campaign?.maximumPayableViews?.toLocaleString()}.
        </span>
      </div>
      <div className="field-grid" style={{ marginTop: 12 }}>
        <label className="field">
          <span>Approved views (member reported {s.reportedViews.toLocaleString()})</span>
          <input
            className="input"
            type="number"
            min="0"
            max={s.reportedViews}
            value={views}
            onChange={e => setViews(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Review note {"(required for rejection)"}</span>
          <input
            className="input"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Record the decision reason."
          />
        </label>
      </div>
      <div className="button-row">
        <button
          className="button-app"
          disabled={busy || Number(views) > s.reportedViews}
          onClick={() => onReview("approved", Number(views), note || undefined)}
        >
          Approve {Number(views || 0).toLocaleString()} views · ≈ {formatKes(Math.min(Number(views || 0), campaign?.maximumPayableViews ?? 0) * (campaign?.rateMinor ?? 0))}
        </button>
        <button
          className="button-app danger"
          disabled={busy || !note.trim()}
          onClick={() => onReview("rejected", 0, note)}
        >
          Reject evidence
        </button>
      </div>
    </article>
  );
}

function AdminWithdrawal({ row, b2c, onPay, onReject, onFail, busy }: { row: any; b2c: boolean; onPay: () => void; onReject: (note: string) => void; onFail: (note: string) => void; busy: boolean }) {
  const w = row.withdrawal;
  const [note, setNote] = useState("");
  const canPay = w.status === "pending" || w.status === "payout_failed";
  const canReject = w.status === "pending" || w.status === "payout_failed" || (w.status === "processing" && !w.conversationId);
  return (
    <article className="surface surface-pad review-card">
      <div className="section-line">
        <div>
          <p className="page-eyebrow">
            Withdrawal #{w.id} · {date(w.createdAt)}
          </p>
          <h2>{row.userName ?? "Member"}</h2>
          <small className="muted">
            {row.email} · M-Pesa {w.mpesaPhone}
          </small>
        </div>
        <Badge value={w.status} />
      </div>
      <div className="campaign-stats">
        <span>
          <small>Requested</small>
          <b>{formatKes(w.amountMinor)}</b>
        </span>
        <span>
          <small>Fee</small>
          <b>{formatKes(w.feeMinor)}</b>
        </span>
        <span>
          <small>Payout</small>
          <b>{formatKes(w.payoutMinor)}</b>
        </span>
      </div>
      {(w.payoutResultDesc || w.payoutReference) && (
        <p className="small-muted">
          {w.payoutReference ? <b>M-Pesa receipt {w.payoutReference}. </b> : null}
          {w.payoutResultDesc}
        </p>
      )}
      {!b2c && canPay && (
        <div className="notice">
          <ShieldCheck size={16} />
          <span>
            <strong>M-Pesa B2C is not configured</strong>Add the B2C credentials on the server to send payouts. Paid is set only by Safaricom's confirmation, never manually.
          </span>
        </div>
      )}
      <label className="field">
        <span>Note (required to reject or mark failed)</span>
        <input className="input" maxLength={2000} value={note} onChange={e => setNote(e.target.value)} placeholder="Reason shown to the member when rejecting" />
      </label>
      <div className="button-row">
        {canPay && (
          <button
            className="button-app"
            disabled={busy || !b2c}
            onClick={() => {
              if (window.confirm(`Send ${formatKes(w.payoutMinor)} to ${w.mpesaPhone} via M-Pesa?`)) onPay();
            }}
          >
            {w.status === "payout_failed" ? "Retry M-Pesa payout" : "Approve & send to M-Pesa"}
          </button>
        )}
        {canReject && (
          <button className="button-app danger" disabled={busy || note.trim().length < 3} onClick={() => onReject(note)}>
            Reject & return funds
          </button>
        )}
        {w.status === "processing" && w.conversationId && (
          <button className="button-app secondary" disabled={busy || note.trim().length < 5} onClick={() => onFail(note)} title="Only after confirming in the M-Pesa portal that no payment was made">
            Mark payout failed (after checking M-Pesa portal)
          </button>
        )}
      </div>
    </article>
  );
}

function SupportAdminCard({
  row,
  onReply,
  busy,
}: {
  row: any;
  onReply: (reply: string, status: "answered" | "closed") => void;
  busy: boolean;
}) {
  const [reply, setReply] = useState(row.ticket.adminReply ?? "");
  return (
    <article className="surface surface-pad review-card">
      <div className="section-line">
        <div>
          <p className="page-eyebrow">
            Request #{row.ticket.id} · {date(row.ticket.createdAt)}
          </p>
          <h2>{row.ticket.subject}</h2>
          <small className="muted">
            {row.userName} · {row.email}
          </small>
        </div>
        <Badge value={row.ticket.status} />
      </div>
      <div className="submission-proof">
        <p>{row.ticket.message}</p>
      </div>
      <label className="field">
        <span>Private response to member</span>
        <textarea
          className="textarea"
          minLength={5}
          maxLength={5000}
          value={reply}
          onChange={e => setReply(e.target.value)}
          placeholder="Write a practical response. Do not ask for M-Pesa PIN or password."
        />
      </label>
      <div className="button-row">
        <button
          className="button-app"
          disabled={busy || reply.trim().length < 5}
          onClick={() => onReply(reply, "answered")}
        >
          Save response
        </button>
        <button
          className="button-app secondary"
          disabled={busy || reply.trim().length < 5}
          onClick={() => onReply(reply, "closed")}
        >
          Respond & close
        </button>
      </div>
    </article>
  );
}

function ReviewCard({
  row,
  onModerate,
  onDelete,
  busy,
}: {
  row: any;
  onModerate: (status: "approved" | "rejected", note?: string) => void;
  onDelete: (note: string) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  return (
    <article className="surface surface-pad review-card">
      <div className="section-line">
        <div>
          <p className="page-eyebrow">
            {row.showCounty && row.county ? `${row.county} (shown)` : "County hidden"} · {date(row.submittedAt)}
          </p>
          <h2>
            {row.displayName} · {"★".repeat(row.rating)}
          </h2>
          <small className="muted">
            Account: {row.accountName} · {row.email} (private)
          </small>
        </div>
        <Badge value={row.deletedAt ? "removed" : row.status} />
      </div>
      <p className="review-quote">“{row.content}”</p>
      {row.reviewNote && <p className="small-muted">Note: {row.reviewNote}</p>}
      <label className="field">
        <span>Moderator note</span>
        <input
          className="input"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Reason, if rejecting or removing"
        />
      </label>
      <div className="button-row">
        <button
          className="button-app"
          disabled={busy}
          onClick={() => onModerate("approved")}
        >
          Approve publicly
        </button>
        <button
          className="button-app secondary"
          disabled={busy || !note.trim()}
          onClick={() => onModerate("rejected", note)}
        >
          Reject with reason
        </button>
        <button
          className="button-app danger"
          disabled={busy || !note.trim()}
          onClick={() => onDelete(note)}
        >
          Remove/soft delete
        </button>
      </div>
    </article>
  );
}

function SettingsForm({
  initial,
  busy,
  onSave,
}: {
  initial: any;
  busy: boolean;
  onSave: (v: any) => void;
}) {
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);
  const put = (k: string, v: string) => setForm((c: any) => ({ ...c, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave({
      ...form,
      activationFeeKes: Number(form.activationFeeKes),
      minimumWithdrawalKes: Number(form.minimumWithdrawalKes),
      withdrawalFeeKes: Number(form.withdrawalFeeKes),
      referralCommissionKes: Number(form.referralCommissionKes),
      maximumWithdrawalKes: Number(form.maximumWithdrawalKes),
      dailyWithdrawalLimitKes: Number(form.dailyWithdrawalLimitKes),
      minimumCampaignBudgetKes: Number(form.minimumCampaignBudgetKes),
      maximumCampaignRateKes: Number(form.maximumCampaignRateKes),
      maximumCampaignDays: Number(form.maximumCampaignDays),
      maximumCampaignParticipants: Number(form.maximumCampaignParticipants),
    });
  };
  return (
    <form className="surface surface-pad form-stack" onSubmit={submit}>
      <div className="field-grid">
        <SettingsField
          form={form}
          put={put}
          k="activationFeeKes"
          label="One-time activation fee (KES)"
        />
        <SettingsField
          form={form}
          put={put}
          k="minimumWithdrawalKes"
          label="Minimum withdrawal (KES)"
        />
        <SettingsField
          form={form}
          put={put}
          k="withdrawalFeeKes"
          label="Withdrawal fee (KES)"
        />
        <SettingsField
          form={form}
          put={put}
          k="maximumWithdrawalKes"
          label="Maximum per withdrawal (KES)"
        />
        <SettingsField
          form={form}
          put={put}
          k="dailyWithdrawalLimitKes"
          label="Rolling 24-hour withdrawal limit (KES)"
        />
        <SettingsField
          form={form}
          put={put}
          k="referralCommissionKes"
          label="Referral commission per activated referral (KES)"
        />
        <SettingsField
          form={form}
          put={put}
          k="minimumCampaignBudgetKes"
          label="Minimum campaign budget (KES)"
        />
        <SettingsField
          form={form}
          put={put}
          k="maximumCampaignRateKes"
          label="Maximum per-view rate (KES)"
        />
        <SettingsField
          form={form}
          put={put}
          k="maximumCampaignDays"
          label="Maximum campaign duration (days)"
        />
        <SettingsField
          form={form}
          put={put}
          k="maximumCampaignParticipants"
          label="Maximum participants per campaign"
        />
        <label className="field">
          <span>Support email (shown on homepage)</span>
          <input className="input" type="email" value={form.supportEmail} onChange={e => put("supportEmail", e.target.value)} />
        </label>
        <label className="field">
          <span>Support phone</span>
          <input className="input" value={form.supportPhone} onChange={e => put("supportPhone", e.target.value)} placeholder="+254…" />
        </label>
        <label className="field">
          <span>Support WhatsApp number</span>
          <input className="input" value={form.supportWhatsapp} onChange={e => put("supportWhatsapp", e.target.value)} placeholder="2547…" />
        </label>
        <label className="field">
          <span>Support hours</span>
          <input className="input" value={form.supportHours} onChange={e => put("supportHours", e.target.value)} placeholder="Mon–Sat, 8am–6pm" />
        </label>
        <label className="field full">
          <span>Banner announcement (top of every member page)</span>
          <textarea
            className="textarea"
            maxLength={1000}
            value={form.announcement}
            onChange={e => put("announcement", e.target.value)}
            placeholder="Optional member/advertiser notice"
          />
        </label>
      </div>
      <p className="small-muted">
        Referral commission is paid once when a referred member activates. Keep
        fees and limits clear to members.
      </p>
      <button className="button-app" disabled={busy}>
        {busy ? "Saving…" : "Save server-side platform settings"}
      </button>
    </form>
  );
}
function SettingsField({
  form,
  put,
  k,
  label,
}: {
  form: any;
  put: (k: string, v: string) => void;
  k: string;
  label: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="input"
        type="number"
        min="0"
        required
        value={form[k]}
        onChange={e => put(k, e.target.value)}
      />
    </label>
  );
}
