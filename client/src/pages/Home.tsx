import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarCheck,
  Check,
  CircleHelp,
  Clock3,
  Eye,
  FileCheck2,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";
import { Wordmark } from "../components/Brand";
import { trpc } from "../lib/trpc";

const categories = [
  {
    name: "Online surveys",
    detail: "Follow a clear questionnaire brief.",
    icon: CircleHelp,
  },
  {
    name: "Video tasks",
    detail: "Watch and complete the stated requirements.",
    icon: Eye,
  },
  {
    name: "Social media",
    detail: "Only approved, policy-compliant activities.",
    icon: ArrowUpRight,
  },
  {
    name: "Website visits",
    detail: "Visit a site and follow its task instructions.",
    icon: ArrowRight,
  },
  {
    name: "Simple microtasks",
    detail: "Complete small tasks against a checklist.",
    icon: FileCheck2,
  },
  {
    name: "Content writing",
    detail: "Submit original writing to an assignment brief.",
    icon: Sparkles,
  },
  {
    name: "Chat & earn",
    detail: "Use safe, legitimate opportunities; never share PINs or codes.",
    icon: MessageCircle,
  },
  {
    name: "Referrals",
    detail: "Share your unique link; configured eligibility applies.",
    icon: Users,
  },
  {
    name: "Daily activities",
    detail: "Configured bonuses only after their stated rules are met.",
    icon: CalendarCheck,
  },
  {
    name: "Special promotions",
    detail: "Administrator-published offers with clear limits.",
    icon: BadgeCheck,
  },
  {
    name: "WhatsApp Status Ads",
    detail: "Post approved creative and submit evidence for review.",
    icon: Eye,
  },
];

const sampleReviews = [
  {
    name: "Brian Mwangi",
    county: "Nairobi County",
    date: "8 Oct 2026 · demo",
    content:
      "Mh, napenda vile naona status ya balance yangu. Mwanzoni nilidhani ni scam, lakini maelezo ya review yako clear.",
  },
  {
    name: "Faith Atieno",
    county: "Kisumu County",
    date: "10 Oct 2026 · demo",
    content:
      "I like that campaign evidence shows a pending status while someone checks it.",
  },
  {
    name: "Kevin Kiptoo",
    county: "Uasin Gishu County",
    date: "12 Oct 2026 · demo",
    content:
      "It helps to see the reward and remaining task slots before I begin.",
  },
  {
    name: "Mary Wanjiku",
    county: "Kiambu County",
    date: "14 Oct 2026 · demo",
    content:
      "The pages are arranged clearly, so it is easy to find profile details and task instructions.",
  },
  {
    name: "Dennis Otieno",
    county: "Siaya County",
    date: "16 Oct 2026 · demo",
    content:
      "Clear instructions show what proof is needed before sending in a task.",
  },
  {
    name: "Sharon Chebet",
    county: "Nakuru County",
    date: "18 Oct 2026 · demo",
    content:
      "Status ad cards explain the view rate, participant limits and evidence review.",
  },
  {
    name: "Peter Kamau",
    county: "Nyeri County",
    date: "20 Oct 2026 · demo",
    content:
      "The withdrawal page explains that an M-Pesa request stays under review until a real payout receipt is recorded.",
  },
  {
    name: "Mercy Naliaka",
    county: "Bungoma County",
    date: "22 Oct 2026 · demo",
    content:
      "Support requests have a clear place in the account rather than a confusing contact form.",
  },
  {
    name: "Samuel Mutua",
    county: "Machakos County",
    date: "24 Oct 2026 · demo",
    content:
      "Campaign details are available before deciding whether the advertisement suits my status.",
  },
  {
    name: "Diana Akinyi",
    county: "Mombasa County",
    date: "26 Oct 2026 · demo",
    content: "The wallet explains pending and available amounts separately.",
  },
];

function MemberReviews() {
  const result = trpc.reviews.publicApproved.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });
  const approved = result.data ?? [];
  const reviews = [
    ...approved
      .slice(0, 10)
      .map(review => ({
        name: review.name,
        county: review.county,
        date: new Date(review.submittedAt).toLocaleDateString("en-KE", {
          month: "short",
          year: "numeric",
        }),
        rating: review.rating,
        content: review.content,
        sample: false,
      })),
    ...sampleReviews
      .slice(0, Math.max(0, 10 - Math.min(10, approved.length)))
      .map(review => ({ ...review, rating: 5, sample: true })),
  ].slice(0, 10);
  const hasSamples = reviews.some(review => review.sample);
  return (
    <section className="section review-section">
      <div className="review-heading">
        <div>
          <p className="eyebrow">
            <span />
            Member community
          </p>
          <h2>WHAT OUR MEMBERS SAY</h2>
          <p>
            {hasSamples
              ? "Demonstration layout examples only. Genuine member reviews appear here after administrator approval."
              : "Real experiences and feedback from the KaziFlow community."}
          </p>
        </div>
        <a className="button button-outline" href="/login?next=%2Freviews">
          Write a review <ArrowRight size={15} />
        </a>
      </div>
      {hasSamples && (
        <div className="review-disclaimer">
          <ShieldCheck size={17} />
          <span>
            <b>Demonstration content — not genuine customer testimonials.</b>{" "}
            Sample names, counties, dates and review text are display examples
            only. They do not represent verified users, real withdrawals, or
            actual member experiences. Replace each sample with real,
            administrator-approved member feedback.
          </span>
        </div>
      )}
      {result.isError && (
        <p className="small-muted">
          Approved member reviews could not be loaded at this time;
          demonstration cards below remain clearly labeled.
        </p>
      )}
      <div className="review-grid">
        {reviews.map((review, index) => (
          <article
            className="review-card-public"
            key={review.sample ? `sample-${review.name}` : `approved-${index}`}
          >
            <div className="review-card-top">
              <span
                className="review-stars"
                aria-label={`${review.rating} out of 5 stars`}
              >
                {"★".repeat(review.rating)}
                {"☆".repeat(5 - review.rating)}
              </span>
            </div>
            <blockquote>“{review.content}”</blockquote>
            <div className="review-person">
              <span className="review-avatar">{review.name.slice(0, 1)}</span>
              <span>
                <b>{review.name}</b>
                <small>{review.county}</small>
              </span>
            </div>
            <div className="review-date">
              {review.date}
              {review.sample ? " · demonstration date" : ""}
            </div>
          </article>
        ))}
      </div>
      <p className="small-muted review-footnote">
        Only member-submitted reviews approved by administrators are presented
        as real member feedback. No “verified member” badge is shown unless
        actual verification has been implemented.
      </p>
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="eyebrow">
      <span />
      {children}
    </p>
  );
}

export default function Home() {
  return (
    <div className="public-page">
      <header className="public-header">
        <Wordmark />
        <nav className="public-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#member-work">For members</a>
          <a href="#advertisers">For advertisers</a>
          <a href="#trust">Trust & safety</a>
        </nav>
        <div className="header-actions">
          <a className="link-muted" href="/login">
            Sign in
          </a>
          <a className="button button-primary button-small" href="/register">
            Create account <ArrowRight size={15} />
          </a>
        </div>
      </header>

      <main>
        <section className="hero-wrap">
          <div className="hero-copy">
            <SectionLabel>Digital work, with clear steps</SectionLabel>
            <h1>
              Small tasks.
              <br />
              <em>Clear records.</em>
            </h1>
            <p className="hero-lede">
              Choose a task, follow its requirements, and see what happens next.
              KaziFlow keeps reviews, earnings and M-Pesa withdrawals in one
              account.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="/register">
                Explore KaziFlow <ArrowRight size={17} />
              </a>
              <a className="button button-outline" href="#how-it-works">
                See how it works <ArrowDown size={16} />
              </a>
            </div>
            <p className="hero-note">
              <ShieldCheck size={15} /> No guaranteed income claims. Rewards and
              availability are shown on each task.
            </p>
          </div>
          <div
            className="hero-visual"
            aria-label="Illustration of a KaziFlow task and review ledger"
          >
            <div className="hero-visual-top">
              <div>
                <span className="mini-mark">K</span>
                <span>Work ledger</span>
              </div>
              <span className="status-chip status-neutral">Example view</span>
            </div>
            <div className="ledger-balance">
              <span>Every reward has a status</span>
              <strong>
                Pending review <i>→</i> Approved <i>→</i> Wallet
              </strong>
              <small>Credits appear after approval—not before.</small>
            </div>
            <div className="ledger-row">
              <div className="ledger-icon icon-clay">
                <CircleHelp size={17} />
              </div>
              <div className="ledger-detail">
                <strong>Survey completion</strong>
                <span>Requirements shown before you start</span>
              </div>
              <span className="status-chip status-review">Review</span>
            </div>
            <div className="ledger-row">
              <div className="ledger-icon icon-olive">
                <BadgeCheck size={17} />
              </div>
              <div className="ledger-detail">
                <strong>WhatsApp Status Ad</strong>
                <span>Status + insights screenshots</span>
              </div>
              <span className="status-chip status-neutral">Evidence</span>
            </div>
            <div className="ledger-row">
              <div className="ledger-icon icon-blue">
                <WalletCards size={17} />
              </div>
              <div className="ledger-detail">
                <strong>M-Pesa withdrawal</strong>
                <span>Admin review, receipt recorded</span>
              </div>
              <span className="status-chip status-neutral">Tracked</span>
            </div>
            <div className="ledger-footer">
              <span>One place for tasks, evidence and money movement.</span>
              <ArrowUpRight size={16} />
            </div>
            <span className="visual-stamp">
              KES
              <br />
              <b>↗</b>
            </span>
          </div>
        </section>

        <section id="how-it-works" className="section section-how">
          <div className="section-heading">
            <SectionLabel>A predictable process</SectionLabel>
            <h2>
              Know the next step
              <br />
              <em>before you take it.</em>
            </h2>
            <p>
              Each activity has a brief, a reward, and a review status. Your
              balance changes only when a task or payment is confirmed.
            </p>
          </div>
          <div className="step-list">
            <article className="step-row">
              <span className="step-index">01</span>
              <div>
                <h3>Create your account</h3>
                <p>
                  Use your email and phone number. Members activate once before
                  starting earning tasks.
                </p>
              </div>
              <span className="step-rule" />
            </article>
            <article className="step-row">
              <span className="step-index">02</span>
              <div>
                <h3>Choose work with a clear brief</h3>
                <p>
                  Check the instructions, time estimate, reward and remaining
                  slots before you begin.
                </p>
              </div>
              <span className="step-rule" />
            </article>
            <article className="step-row">
              <span className="step-index">03</span>
              <div>
                <h3>Submit. Track. Withdraw.</h3>
                <p>
                  Reviewers check evidence. Approved rewards move to your
                  wallet; M-Pesa withdrawals are tracked by status.
                </p>
              </div>
              <span className="step-rule" />
            </article>
          </div>
        </section>

        <section id="member-work" className="section section-member">
          <div className="section-heading section-heading-wide">
            <SectionLabel>For members</SectionLabel>
            <h2>
              Choose work that
              <br />
              <em>fits the brief.</em>
            </h2>
            <p>
              Browse active tasks across practical categories. Each listing
              explains the work and what counts as a complete submission.
            </p>
          </div>
          <div className="category-grid">
            {categories.map(({ name, detail, icon: Icon }, index) => (
              <article
                className={`category-card category-card-${index + 1}`}
                key={name}
              >
                <div className="category-icon">
                  <Icon size={19} />
                </div>
                <h3>{name}</h3>
                <p>{detail}</p>
                <span className="category-line" />
              </article>
            ))}
          </div>
          <div className="callout-bar">
            <div>
              <strong>Find the right starting point.</strong>
              <span>
                Task availability and rewards are set by the platform and
                advertisers.
              </span>
            </div>
            <a className="button button-dark" href="/register">
              Browse as a member <ArrowRight size={16} />
            </a>
          </div>
        </section>

        <section className="section whatsapp-feature">
          <div className="whatsapp-copy">
            <SectionLabel>A distinct earning channel</SectionLabel>
            <h2>
              WhatsApp Status Ads,
              <br />
              <em>with evidence in the open.</em>
            </h2>
            <p>
              Campaigns show their rate per eligible view, limits, duration and
              instructions. Members submit a screenshot of the posted status and
              another of the view insights. An administrator reviews the
              evidence before any reward is credited.
            </p>
            <p className="evidence-note">
              <Eye size={17} /> Screenshots are user-submitted evidence. They do
              not independently verify every viewer.
            </p>
            <a className="button button-primary" href="/register">
              View member opportunities <ArrowRight size={16} />
            </a>
          </div>
          <div className="evidence-card">
            <div className="evidence-card-head">
              <span>Campaign review</span>
              <span className="status-chip status-review">Human review</span>
            </div>
            <div className="evidence-mock">
              <div className="mock-status">
                <span className="mock-avatar">K</span>
                <div>
                  <b>Campaign example</b>
                  <small>Shared to WhatsApp Status</small>
                </div>
                <BadgeCheck size={17} />
              </div>
              <div className="mock-divider" />
              <div className="mock-metrics">
                <div>
                  <small>Evidence received</small>
                  <strong>2 screenshots</strong>
                </div>
                <div>
                  <small>Decision</small>
                  <strong>Not yet reviewed</strong>
                </div>
              </div>
            </div>
            <div className="evidence-steps">
              <span>
                <Check size={14} /> Status screenshot
              </span>
              <span>
                <Check size={14} /> Insights screenshot
              </span>
              <span>
                <Clock3 size={14} /> Approval before credit
              </span>
            </div>
          </div>
        </section>

        <section id="advertisers" className="section section-advertisers">
          <div className="advertiser-panel">
            <div className="advertiser-copy">
              <SectionLabel>For advertisers</SectionLabel>
              <h2>
                Reach real status
                <br />
                <em>audiences responsibly.</em>
              </h2>
              <p>
                Set a budget, view rate, eligible-view limits, duration and
                participant cap. Upload your creative, fund the campaign, and
                review its submitted evidence and spend.
              </p>
              <a
                className="button button-light"
                href="/register?type=advertiser"
              >
                Open advertiser account <ArrowRight size={16} />
              </a>
            </div>
            <div className="campaign-ticket">
              <div className="ticket-head">
                <BriefcaseBusiness size={17} />
                <span>Campaign controls</span>
              </div>
              <div className="ticket-line">
                <span>Pay per eligible view</span>
                <b>Set by advertiser</b>
              </div>
              <div className="ticket-line">
                <span>Maximum payable views</span>
                <b>Set a limit</b>
              </div>
              <div className="ticket-line">
                <span>Campaign budget</span>
                <b>Fund before review</b>
              </div>
              <div className="ticket-line">
                <span>Participant evidence</span>
                <b>Reviewed by admin</b>
              </div>
              <p>
                Campaigns stay inactive until funding is confirmed and an
                administrator approves them.
              </p>
            </div>
          </div>
        </section>

        <section id="trust" className="section trust-section">
          <div className="section-heading">
            <SectionLabel>Trust is a product feature</SectionLabel>
            <h2>
              Clear states.
              <br />
              <em>Careful promises.</em>
            </h2>
            <p>
              Money-affecting actions are recorded. Provider credentials stay on
              the server. No fake payment alerts, invented member totals or
              guaranteed earnings claims.
            </p>
          </div>
          <div className="trust-list">
            <div>
              <ShieldCheck size={20} />
              <span>
                <b>Provider-confirmed payments</b>
                <small>
                  Activation depends on Safaricom confirmation, not a browser
                  message.
                </small>
              </span>
            </div>
            <div>
              <FileCheck2 size={20} />
              <span>
                <b>Visible review decisions</b>
                <small>
                  Submissions show pending, approved or rejected states.
                </small>
              </span>
            </div>
            <div>
              <WalletCards size={20} />
              <span>
                <b>Auditable wallet records</b>
                <small>
                  Requests reserve funds; Paid remains locked until a payout
                  provider can verify disbursement.
                </small>
              </span>
            </div>
          </div>
        </section>

        <section className="section withdrawal-explainer">
          <div className="section-heading">
            <SectionLabel>Wallet clarity</SectionLabel>
            <h2>
              How M-Pesa
              <br />
              <em>withdrawals work.</em>
            </h2>
            <p>
              Withdrawals begin with a request, not an instant payout. Your
              balance is reserved while the administrator handles the payment.
            </p>
          </div>
          <div className="withdrawal-steps">
            <article>
              <span>01</span>
              <div>
                <b>Request</b>
                <p>
                  Choose an amount and your saved M-Pesa number. Eligibility and
                  configured limits are checked.
                </p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <b>Review</b>
                <p>
                  Funds are reserved and the request moves through Pending or
                  Processing status.
                </p>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <b>Confirm</b>
                <p>
                  KaziFlow currently supports Pending and Processing. Paid stays
                  disabled until a payout provider can verify disbursement;
                  rejected requests release the reserve.
                </p>
              </div>
            </article>
            <a className="text-link" href="/withdrawal-policy">
              Read the withdrawal policy <ArrowRight size={14} />
            </a>
          </div>
        </section>

        <MemberReviews />

        <section className="section faq-section">
          <div className="section-heading">
            <SectionLabel>Helpful details</SectionLabel>
            <h2>
              Good questions,
              <br />
              <em>straight answers.</em>
            </h2>
          </div>
          <div className="faq-list">
            <details>
              <summary>
                Is any amount of income guaranteed?<span>+</span>
              </summary>
              <p>
                No. Task availability, eligibility, review and advertiser
                budgets vary. KaziFlow does not promise a level of earnings.
              </p>
            </details>
            <details>
              <summary>
                When is task money added to my wallet?<span>+</span>
              </summary>
              <p>
                After a task submission is reviewed and approved. WhatsApp
                Status Ad evidence also requires review before its eligible
                reward can be credited.
              </p>
            </details>
            <details>
              <summary>
                How is a withdrawal handled?<span>+</span>
              </summary>
              <p>
                Submit a request to your saved M-Pesa number. The amount is
                reserved during administrator review. The current release
                supports Pending or Processing only; Paid is disabled until
                verified disbursement integration is configured.
              </p>
            </details>
            <details>
              <summary>
                Are WhatsApp screenshot views independently verified?
                <span>+</span>
              </summary>
              <p>
                No. They are member-submitted evidence reviewed by an
                administrator and are not independent verification of each
                viewer.
              </p>
            </details>
          </div>
        </section>

        <section className="section contact-section">
          <div>
            <SectionLabel>Contact & support</SectionLabel>
            <h2>
              Need help with
              <br />
              <em>a real account issue?</em>
            </h2>
            <p>
              Registered members can send a private ticket about activation, a
              task, campaign evidence or a withdrawal. Never share a password,
              M-Pesa PIN or one-time code.
            </p>
          </div>
          <a className="button button-primary" href="/login?next=%2Fsupport">
            Open member support <ArrowRight size={16} />
          </a>
        </section>

        <section className="closing-cta">
          <div>
            <span className="closing-mark">
              <BadgeCheck size={20} />
            </span>
            <p>For the work ahead</p>
            <h2>Start with a clear brief.</h2>
          </div>
          <a className="button button-light" href="/register">
            Create a KaziFlow account <ArrowRight size={16} />
          </a>
        </section>
      </main>

      <footer className="public-footer">
        <div className="footer-main">
          <Wordmark inverse />
          <p>A clearer route from digital work to accountable records.</p>
          <span className="footer-locale">
            Kenya · Built for practical digital work
          </span>
        </div>
        <div className="footer-links">
          <div>
            <b>Explore</b>
            <a href="/register">Member account</a>
            <a href="/register?type=advertiser">Advertiser account</a>
            <a href="/login">Sign in</a>
          </div>
          <div>
            <b>Policies</b>
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
            <a href="/payments">Payments</a>
          </div>
          <div>
            <b>Guidance</b>
            <a href="/task-guidelines">Task guidelines</a>
            <a href="/advertising-guidelines">Advertising guidelines</a>
            <a href="/withdrawal-policy">Withdrawal policy</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} KaziFlow</span>
          <span>
            Rewards depend on eligibility, evidence and review. No
            guaranteed-income claims.
          </span>
        </div>
      </footer>
    </div>
  );
}
