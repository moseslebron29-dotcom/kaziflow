import { useState } from "react";
import { ArrowRight, Clock3, FileCheck2, Users } from "lucide-react";
import { Wordmark } from "../components/Brand";
import { trpc } from "../lib/trpc";
import { formatKes } from "../lib/format";
import { TASK_CATEGORIES, TASK_GROUPS, categoryLabel } from "@shared/taskCategories";

/** Task listings for visitors. Starting a task sends them to register / sign in. */
export default function PublicTasks() {
  const [group, setGroup] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const tasks = trpc.member.tasks.useQuery(category !== "all" ? { category: category as any } : group !== "all" ? { group: group as any } : undefined);
  const info = trpc.site.info.useQuery(undefined, { staleTime: 300_000 });
  return (
    <div className="public-page">
      <header className="public-header">
        <Wordmark />
        <nav className="public-nav" aria-label="Main navigation">
          <a href="/">Home</a>
          <a href="/#member-work">Earning categories</a>
          <a href="/#reviews">Reviews</a>
        </nav>
        <div className="header-actions">
          <a className="link-muted" href="/login?next=%2Ftasks">
            Sign in
          </a>
          <a className="button button-primary button-small" href="/register">
            Create account <ArrowRight size={15} />
          </a>
        </div>
      </header>
      <main className="public-tasks">
        <p className="eyebrow">
          <span />
          Available tasks
        </p>
        <h1>
          Browse tasks. <em>Start when you're ready.</em>
        </h1>
        <p className="hero-lede">
          Anyone can browse. To start a task, create a free account, verify your email and activate once with KES {info.data?.activationFeeKes ?? 100} via M-Pesa.
        </p>
        <div className="filter-row" style={{ marginTop: 18 }}>
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
          {TASK_CATEGORIES.filter(c => group === "all" || c.group === group).map(c => (
            <button type="button" key={c.id} className={`filter-chip ${category === c.id ? "active" : ""}`} onClick={() => setCategory(category === c.id ? "all" : c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        {tasks.isLoading ? (
          <p className="muted">Loading tasks…</p>
        ) : !tasks.data?.length ? (
          <div className="empty-state">
            <FileCheck2 size={25} />
            <h3>No tasks in this category right now</h3>
            <p>New tasks are published regularly. Create an account to be ready when they go live.</p>
            <a className="button-app" href="/register" style={{ marginTop: 14 }}>
              Create account
            </a>
          </div>
        ) : (
          <div className="task-grid">
            {tasks.data.map(task => (
              <article className={`task-card${task.featured ? " task-card-featured" : ""}`} key={task.id}>
                <div className="task-meta">
                  <span className="badge">{categoryLabel(task.category)}</span>
                  {task.repeatDaily && <span className="badge processing">Daily</span>}
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
                </div>
                <div className="task-requirements">
                  <b>Submission requirements</b>
                  <p>{task.completionRequirements}</p>
                </div>
                <div className="task-card-foot">
                  <strong className="task-reward">{formatKes(task.rewardMinor)}</strong>
                  <a className="button-app" href={`/register?next=${encodeURIComponent("/tasks")}`}>
                    Start task <ArrowRight size={14} />
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
