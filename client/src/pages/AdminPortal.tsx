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
} from "lucide-react";
import { Wordmark } from "../components/Brand";
import { UserHistoryModal } from "../components/UserHistoryModal";
import { useTheme } from "../contexts/ThemeContext";
import { trpc } from "../lib/trpc";
import { formatKes } from "../lib/format";

const tabs = [
  ["overview", "Overview", Home],
  ["users", "Users", Users],
  ["tasks", "Tasks", BriefcaseBusiness],
  ["task-review", "Task review", FileCheck2],
  ["wa-review", "WhatsApp evidence", Eye],
  ["campaigns", "Ad campaigns", Activity],
  ["payments", "M-Pesa payments", CircleDollarSign],
  ["withdrawals", "Withdrawals", WalletCards],
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
    enabled: tab === "overview",
  });
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewRating, setReviewRating] = useState<number | undefined>();
  const usersQuery = trpc.admin.users.useQuery(
    { query: search || undefined },
    { enabled: tab === "users" }
  );
  const tasksQuery = trpc.admin.tasks.useQuery(undefined, {
    enabled: tab === "tasks",
  });
  const taskSubmissions = trpc.admin.taskSubmissions.useQuery(
    { status: "pending" },
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
  const withdrawals = trpc.admin.withdrawals.useQuery(undefined, {
    enabled: tab === "withdrawals",
  });
  const tickets = trpc.admin.supportTickets.useQuery(
    { status: "open" },
    { enabled: tab === "support" }
  );
  const reviewQueue = trpc.reviews.adminList.useQuery(
    { status: "pending", query: reviewSearch || undefined, rating: reviewRating },
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
  const updateWithdrawal = trpc.admin.processWithdrawal.useMutation({
    onSuccess: async () => {
      toast.success("Withdrawal request updated.");
      await Promise.all([
        utils.admin.withdrawals.invalidate(),
        utils.admin.overview.invalidate(),
      ]);
    },
  });
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
  const createTask = trpc.admin.createTask.useMutation({
    onSuccess: async () => {
      toast.success("Task saved to the marketplace.");
      await Promise.all([
        utils.admin.tasks.invalidate(),
        utils.admin.overview.invalidate(),
      ]);
    },
  });
  const editTask = trpc.admin.updateTask.useMutation({
    onSuccess: async () => {
      toast.success("Task updated.");
      await utils.admin.tasks.invalidate();
    },
  });
  const archiveTask = trpc.admin.deleteTask.useMutation({
    onSuccess: async () => {
      toast.success("Task archived; submission records were retained.");
      await utils.admin.tasks.invalidate();
    },
  });
  const isSuper = user.role === "super_admin";
  const switchTab = (newTab: Tab) => {
    setTab(newTab);
    window.history.replaceState({}, "", `/admin?tab=${newTab}`);
  };
  const tabLabel = tabs.find(item => item[0] === tab)?.[1] ?? "Overview";

  const render = () => {
    if (tab === "overview")
      return (
        <>
          <Intro
            title="Operations overview."
            subtitle="Live counts from KaziFlow records. No sample users, payments or balances are seeded."
          />
          <div className="dashboard-grid">
            <Metric label="Registered users" value={overview.data?.users} />
            <Metric
              label="Activated members"
              value={overview.data?.activatedUsers}
            />
            <Metric label="Tasks listed" value={overview.data?.tasks} />
            <Metric
              label="Pending task submissions"
              value={overview.data?.pendingTaskSubmissions}
            />
            <Metric
              label="WhatsApp evidence queue"
              value={overview.data?.pendingWhatsAppReviews}
            />
            <Metric
              label="Active campaigns"
              value={overview.data?.activeCampaigns}
            />
            <Metric
              label="Payments to investigate"
              value={overview.data?.paymentsToInvestigate}
            />
            <Metric
              label="Pending withdrawals"
              value={overview.data?.pendingWithdrawals}
            />
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
                Withdrawal Paid status stays locked until a payout provider
                callback can confirm actual disbursement.
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
                            value={row.activatedAt ? "activated" : "inactive"}
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
                        <td>{row.category}</td>
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
                            <button
                              className="button-app secondary"
                              onClick={() => archiveTask.mutate({ id: row.id })}
                            >
                              Archive
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
            subtitle="Approve only after checking the requested proof. Credits are applied transactionally and never on browser submission alone."
          />
          {taskSubmissions.isLoading ? (
            <p className="muted">Loading queue…</p>
          ) : !taskSubmissions.data?.length ? (
            <Empty
              title="Task queue clear"
              text="There are no pending submissions."
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
            subtitle="Move requests to Processing or reject with a reason. Paid is unavailable until a provider callback can confirm actual disbursement."
          />
          {withdrawals.isLoading ? (
            <p className="muted">Loading requests…</p>
          ) : !withdrawals.data?.length ? (
            <Empty
              title="No withdrawal requests"
              text="There are no member withdrawal records yet."
            />
          ) : (
            <div className="withdrawal-admin-list">
              {withdrawals.data.map((row: any) => (
                <AdminWithdrawal
                  key={row.withdrawal.id}
                  row={row}
                  onUpdate={(input: any) => updateWithdrawal.mutate(input)}
                  busy={updateWithdrawal.isPending}
                />
              ))}
            </div>
          )}
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
            subtitle="Member reviews are private until approved. Samples displayed on the homepage are clearly labeled demonstrations, not customer claims."
          />
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
              title="Review queue clear"
              text="No pending member reviews."
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
              {key === "wa-review" &&
                (overview.data?.pendingWhatsAppReviews ?? 0) > 0 && (
                  <i className="nav-count">
                    {overview.data?.pendingWhatsAppReviews}
                  </i>
                )}
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
          <button
            className="topbar-icon"
            aria-label="Toggle theme"
            onClick={() => theme.toggleTheme?.()}
          >
            <Sun size={15} />
          </button>
        </div>
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
  const [form, setForm] = useState({
    category: initial?.category ?? "survey",
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    instructions: initial?.instructions ?? "",
    completionRequirements: initial?.completionRequirements ?? "",
    rewardKes: String((initial?.rewardMinor ?? 500) / 100),
    budgetKes: String((initial?.budgetMinor ?? 50000) / 100),
    estimatedMinutes: String(initial?.estimatedMinutes ?? 5),
    slotLimit: String(initial?.slotLimit ?? 100),
    completionMode: initial?.completionMode ?? "manual",
    externalUrl: initial?.externalUrl ?? "",
    status: initial?.status ?? "draft",
  });
  const put = (k: string, v: string) => setForm(c => ({ ...c, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      rewardKes: Number(form.rewardKes),
      budgetKes: Number(form.budgetKes),
      estimatedMinutes: Number(form.estimatedMinutes),
      slotLimit: Number(form.slotLimit),
      externalUrl: form.externalUrl.trim() || undefined,
      status: form.status as any,
    };
    if (initial?.id) update?.({ id: initial.id, ...payload });
    else create?.(payload);
    if (!inline) setOpen(false);
  };
  return (
    <>
      {inline ? (
        <button
          className="button-app secondary"
          onClick={() => setOpen(v => !v)}
        >
          {open ? "Close" : "Edit"}
        </button>
      ) : (
        <section className="surface surface-pad" style={{ marginTop: 12 }}>
          <div className="section-line">
            <h2 className="surface-title">Create a task</h2>
            <span className="badge">Fund reward pool before publishing</span>
          </div>
          <p className="small-muted">
            Choose active only when the brief and reward budget are ready for
            member submissions.
          </p>
        </section>
      )}
      {open && (
        <form
          className={`admin-task-form ${inline ? "inline-editor" : "surface surface-pad"}`}
          onSubmit={submit}
        >
          <div className="field-grid">
            <label className="field">
              <span>Category</span>
              <select
                className="select"
                value={form.category}
                onChange={e => put("category", e.target.value)}
              >
                {[
                  "survey",
                  "video",
                  "social",
                  "website",
                  "microtask",
                  "chat",
                  "writing",
                  "daily",
                  "promotion",
                ].map(v => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select
                className="select"
                value={form.status}
                onChange={e => put("status", e.target.value)}
              >
                {["draft", "active", "paused", "closed"].map(v => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <Field
              form={form}
              put={put}
              k="title"
              label="Task title"
              required
            />
            <Field
              form={form}
              put={put}
              k="rewardKes"
              label="Reward (KES)"
              type="number"
              required
            />
            <Field
              form={form}
              put={put}
              k="budgetKes"
              label="Total allocated reward budget (KES)"
              type="number"
              required
            />
            <Field
              form={form}
              put={put}
              k="estimatedMinutes"
              label="Estimated minutes"
              type="number"
              required
            />
            <Field
              form={form}
              put={put}
              k="slotLimit"
              label="Participant slots"
              type="number"
              required
            />
            <label className="field">
              <span>Completion mode</span>
              <select
                className="select"
                value={form.completionMode}
                onChange={e => put("completionMode", e.target.value)}
              >
                {["manual", "video_progress", "link_visit"].map(v => (
                  <option value={v} key={v}>
                    {v.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <Field
              form={form}
              put={put}
              k="externalUrl"
              label="Optional work URL"
              type="url"
            />
            <label className="field full">
              <span>Description</span>
              <textarea
                className="textarea"
                minLength={5}
                maxLength={5000}
                required
                value={form.description}
                onChange={e => put("description", e.target.value)}
              />
            </label>
            <label className="field full">
              <span>Instructions</span>
              <textarea
                className="textarea"
                minLength={3}
                maxLength={5000}
                required
                value={form.instructions}
                onChange={e => put("instructions", e.target.value)}
              />
            </label>
            <label className="field full">
              <span>Completion requirements</span>
              <textarea
                className="textarea"
                minLength={3}
                maxLength={3000}
                required
                value={form.completionRequirements}
                onChange={e => put("completionRequirements", e.target.value)}
              />
            </label>
          </div>
          <div className="button-row">
            <button className="button-app" disabled={createBusy || updateBusy}>
              {initial?.id ? "Save task changes" : "Create task"}{" "}
              <Check size={14} />
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
          <p className="page-eyebrow">{row.taskTitle ?? `Task #${s.taskId}`}</p>
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
        <p>{s.proofText}</p>
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
        <button
          className="button-app"
          disabled={busy}
          onClick={() => onReview("approved", note || undefined)}
        >
          Approve & credit {formatKes(s.rewardMinor)}
        </button>
        <button
          className="button-app danger"
          disabled={busy || !note.trim()}
          onClick={() => onReview("rejected", note)}
        >
          Reject with reason
        </button>
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
          <span>Administrator-approved eligible views</span>
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
          Approve & credit calculated reward
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

function AdminWithdrawal({
  row,
  onUpdate,
  busy,
}: {
  row: any;
  onUpdate: (v: any) => void;
  busy: boolean;
}) {
  const w = row.withdrawal;
  const [note, setNote] = useState("");
  const action = (decision: "processing" | "rejected") =>
    onUpdate({ id: w.id, decision, note: note || undefined });
  return (
    <article className="surface surface-pad review-card">
      <div className="section-line">
        <div>
          <p className="page-eyebrow">
            Withdrawal #{w.id} · {date(w.createdAt)}
          </p>
          <h2>{row.userName ?? "Member"}</h2>
          <small className="muted">
            {row.email} · {w.mpesaPhone}
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
          <small>Net payout if processed</small>
          <b>{formatKes(w.payoutMinor)}</b>
        </span>
      </div>
      <div className="notice">
        <ShieldCheck size={16} />
        <span>
          <strong>Paid status is locked</strong>
          No payout provider callback is configured. A staff-entered receipt or
          checkbox must not mark funds as paid.
        </span>
      </div>
      <label className="field">
        <span>Administrator note (required to reject)</span>
        <textarea
          className="textarea"
          maxLength={2000}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Record processing details or explain a rejection."
        />
      </label>
      <div className="button-row">
        {w.status === "pending" && (
          <button
            className="button-app secondary"
            disabled={busy}
            onClick={() => action("processing")}
          >
            Mark processing
          </button>
        )}
        { ["pending", "processing"].includes(w.status) && (
          <>
            <button
              className="button-app danger"
              disabled={busy || !note.trim()}
              onClick={() => action("rejected")}
            >
              Reject & release funds
            </button>
          </>
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
            {row.county ?? "Kenya"} · {date(row.submittedAt)}
          </p>
          <h2>
            {row.name} · {row.rating}/5
          </h2>
          <small className="muted">
            Account #{row.userId} · {row.email}
          </small>
        </div>
        <Badge value={row.status} />
      </div>
      <p className="review-quote">“{row.content}”</p>
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
          label="Referral commission (KES)"
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
        <label className="field full">
          <span>Platform announcement</span>
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
        Activation fee may not be set below KES 100. Ensure limits and fees are
        clearly communicated before operational use.
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
