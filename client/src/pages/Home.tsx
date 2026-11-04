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
  Share2,
  Laptop,
  Gamepad2,
  MessageSquareQuote,
  Mail,
  Phone,
} from "lucide-react";
import { Wordmark } from "../components/Brand";
import { trpc } from "../lib/trpc";
import { AdSlot } from "../components/AdSlot";
import VisitorAd from "../components/VisitorAd";

const earningGroups = [
  {
    id: "social",
    title: "Social Media Tasks",
    icon: Share2,
    detail: "Follow, like, comment and engage on the platforms you already use.",
    items: ["TikTok", "YouTube", "Instagram", "Facebook", "X / Twitter", "Telegram"],
  },
  {
    id: "online",
    title: "Online Tasks",
    icon: Laptop,
    detail: "Practical work you can do from your phone or computer.",
    items: ["Online surveys", "Website visits", "App testing", "Product reviews", "Data entry", "Typing", "Copywriting", "Translation", "Simple research", "Image categorization", "Content moderation"],
  },
  {
    id: "entertainment",
    title: "Entertainment & Interactive",
    icon: Gamepad2,
    detail: "Learn, play and compete — with rewards set on every task.",
    items: ["Watch videos", "Educational quizzes", "Trivia challenges", "Games & competitions", "Daily rewards"],
  },
  {
    id: "other",
    title: "Other Earning Opportunities",
    icon: Sparkles,
    detail: "More ways to earn, from writing to advertiser campaigns.",
    items: ["Chat & writing", "Referral tasks", "WhatsApp Status Ads", "Promotional campaigns", "Limited-time tasks", "Sponsored tasks"],
  },
];

function Stars({ rating }: { rating: number }) {
  return (
    <span className="review-stars" aria-label={`${rating} out of 5 stars`}>
      {"★".repeat(rating)}
      <i>{"★".repeat(5 - rating)}</i>
    </span>
  );
}

function MemberReviews() {
  const result = trpc.reviews.publicApproved.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const reviews = result.data ?? [];
  const average = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  return (
    <section id="reviews" className="section review-section">
      <div className="review-heading">
        <div>
          <p className="eyebrow">
            <span />
            Member reviews
          </p>
          <h2>WHAT KENYANS ARE SAYING ABOUT KAZIFLOW</h2>
          <p>
            {reviews.length
              ? `Real feedback from KaziFlow members · ${average.toFixed(1)} average from ${reviews.length} approved review${reviews.length === 1 ? "" : "s"}.`
              : "Real feedback from KaziFlow members will appear here."}
          </p>
        </div>
        <a className="button button-outline" href="/login?next=%2Freviews">
          Write a review <ArrowRight size={15} />
        </a>
      </div>
      {reviews.length === 0 ? (
        <div className="review-invite">
          <div className="review-invite-icon">
            <MessageSquareQuote size={26} />
          </div>
          <div>
            <h3>Be among the first to share your experience.</h3>
            <p>
              Umejaribu KaziFlow? Tuambie vile imekuwa. Write in English, Kiswahili or Sheng — whatever feels natural. Your review appears here after a quick check by our team, with the name you choose.
            </p>
            <div className="review-invite-actions">
              <a className="button button-primary" href="/login?next=%2Freviews">
                Share my experience <ArrowRight size={15} />
              </a>
              <a className="button button-outline" href="/register">
                Join KaziFlow
              </a>
            </div>
            <ul className="review-invite-points">
              <li>
                <Check size={14} /> Only registered members can review
              </li>
              <li>
                <Check size={14} /> Your email and phone stay private
              </li>
              <li>
                <Check size={14} /> Show your county only if you want to
              </li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="review-grid">
          {reviews.slice(0, 12).map(review => (
            <article className="review-card-public" key={review.id}>
              <div className="review-card-top">
                <Stars rating={review.rating} />
                <span className="review-date">{new Date(review.date).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
              <blockquote>“{review.content}”</blockquote>
              <div className="review-person">
                <span className="review-avatar">{review.displayName.slice(0, 1).toUpperCase()}</span>
                <span>
                  <b>{review.displayName}</b>
                  {review.county && <small>{review.county} County</small>}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SupportSection() {
  const info = trpc.site.info.useQuery(undefined, { staleTime: 300_000, retry: false });
  const support = info.data?.support;
  const wa = support?.whatsapp?.replace(/\D/g, "");
  return (
    <section id="support" className="section contact-section">
      <div>
        <SectionLabel>Contact & support</SectionLabel>
        <h2>
          Need help?
          <br />
          <em>Tuko hapa.</em>
        </h2>
        <p>
          Members can open a private support ticket about activation, a task, campaign evidence or a withdrawal. Never share your password, M-Pesa PIN or verification code with anyone.
        </p>
        {(support?.email || support?.phone || wa) && (
          <div className="support-channels">
            {support?.email && (
              <a href={`mailto:${support.email}`}>
                <Mail size={16} /> {support.email}
              </a>
            )}
            {support?.phone && (
              <a href={`tel:${support.phone.replace(/\s/g, "")}`}>
                <Phone size={16} /> {support.phone}
              </a>
            )}
            {wa && (
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer noopener">
                <MessageCircle size={16} /> WhatsApp support
              </a>
            )}
            {support?.hours && (
              <span>
                <Clock3 size={16} /> {support.hours}
              </span>
            )}
          </div>
        )}
      </div>
      <a className="button button-primary" href="/login?next=%2Fsupport">
        Open member support <ArrowRight size={16} />
      </a>
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

const faqs = [
  { q: "Is KaziFlow free to join?", a: "Registration is free. To start tasks and WhatsApp Status campaigns, members pay a one-time KES 100 activation fee through an official M-Pesa prompt. Your account activates only after Safaricom confirms the payment." },
  { q: "How do I verify my email?", a: "After registering we email you a six-digit code. Enter it on the verification screen within 10 minutes. You can request a new code after 60 seconds." },
  { q: "Is any amount of income guaranteed?", a: "No. Earnings depend on available tasks, slots, advertiser budgets and approval of your work. KaziFlow never promises a fixed income." },
  { q: "When is task money added to my wallet?", a: "When a reviewer approves your submission. Until then it shows as pending. Some quizzes are checked automatically and credited instantly when you pass." },
  { q: "How do WhatsApp Status Ads work?", a: "Post the advertiser's image or video on your WhatsApp Status, then upload a screenshot of the post and of the views. A reviewer approves the eligible views and you are paid per approved view, up to the campaign limit." },
  { q: "How do withdrawals work?", a: "Request a withdrawal to your M-Pesa number from your available balance. It is marked Paid only after Safaricom confirms the payout, and you can see the M-Pesa receipt in your wallet." },
  { q: "How do referrals work?", a: "Share your referral link. When someone registers with it, verifies their email and activates their account, you receive the referral commission shown in your Referrals page. You cannot refer yourself." },
];

export default function Home() {
  return (
    <div className="public-page">
      <VisitorAd />
      <header className="public-header">
        <Wordmark />
        <nav className="public-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="/tasks">Browse tasks</a>
          <a href="#member-work">Earning categories</a>
          <a href="#advertisers">For advertisers</a>
          <a href="#reviews">Reviews</a>
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
              Social media, online, quiz and WhatsApp Status tasks with the reward in
              KES shown upfront. Submit your work, get reviewed, and withdraw to
              M-Pesa — all from your phone.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="/register">
                Create free account <ArrowRight size={17} />
              </a>
              <a className="button button-outline" href="/tasks">
                Browse tasks <ArrowDown size={16} />
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
                <h3>Register & verify</h3>
                <p>
                  Sign up with your email, phone and county, confirm the six-digit
                  code we email you, then activate once with KES 100 via M-Pesa.
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
              Many ways
              <br />
              <em>to earn.</em>
            </h2>
            <p>
              Every task shows its category, reward in KES, estimated time, available
              slots, instructions and exactly what to submit.
            </p>
          </div>
          <div className="earning-group-grid">
            {earningGroups.map(({ id, title, detail, items, icon: Icon }) => (
              <article className="earning-group" key={id}>
                <div className="category-icon">
                  <Icon size={19} />
                </div>
                <h3>{title}</h3>
                <p>{detail}</p>
                <ul>
                  {items.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <a className="text-link" href="/tasks">
                  See available tasks <ArrowRight size={14} />
                </a>
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
            <a className="button button-dark" href="/tasks">
              Browse available tasks <ArrowRight size={16} />
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
                  Withdrawals reserve funds and are marked Paid only after
                  Safaricom confirms the M-Pesa payout.
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
              Request any amount above the minimum from your available balance.
              The amount is reserved immediately and sent to your M-Pesa.
            </p>
          </div>
          <div className="withdrawal-steps">
            <article>
              <span>01</span>
              <div>
                <b>Request</b>
                <p>
                  Enter an amount and your M-Pesa number. Minimums and any fee are
                  shown before you confirm.
                </p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <b>Review & send</b>
                <p>
                  Our team reviews the request, then sends it to M-Pesa. The status
                  moves from Pending to Processing.
                </p>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <b>Paid, with receipt</b>
                <p>
                  When Safaricom confirms the payout, the status changes to Paid
                  with the M-Pesa receipt. Rejected requests return the amount to
                  your balance.
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
            {faqs.map(f => (
              <details key={f.q}>
                <summary>
                  {f.q}
                  <span>+</span>
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <AdSlot slot="home-faq" />

        <SupportSection />

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
