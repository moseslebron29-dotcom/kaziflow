import { useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Wordmark } from "../components/Brand";
import { useTheme } from "../contexts/ThemeContext";
import { trpc } from "../lib/trpc";
import AuthPage from "./AuthPage";
import MemberPortal from "./MemberPortal";
import AdvertiserPortal from "./AdvertiserPortal";
import AdminPortal from "./AdminPortal";
import PublicTasks from "./PublicTasks";
import { AdSlot } from "../components/AdSlot";

const authPaths = [
  "/register",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/admin/login",
  "/admin/setup",
];
const policyCopy: Record<
  string,
  {
    title: string;
    intro: string;
    sections: { heading: string; text: string }[];
  }
> = {
  "/terms": {
    title: "Terms & Conditions",
    intro:
      "These are product terms for using KaziFlow. Have qualified Kenyan counsel review them before public commercial operation.",
    sections: [
      {
        heading: "Accounts and access",
        text: "Provide accurate account details, keep your password and one-time links private, and use one account. KaziFlow may restrict suspicious or abusive activity while a review is conducted.",
      },
      {
        heading: "Tasks and rewards",
        text: "Each task describes its eligibility, work, reward, availability and evidence requirements. Rewards are not guaranteed, may be limited by available slots or advertiser budgets, and are credited only after the stated review or verification.",
      },
      {
        heading: "Activation and payments",
        text: "The published product fee is a one-time KES 100 activation payment unless an authorized platform setting changes it. Activation is granted only after server-side Safaricom Daraja confirmation. Do not pay an unofficial number or repeat an unresolved prompt.",
      },
      {
        heading: "Campaign evidence",
        text: "WhatsApp screenshots are member-submitted evidence, not independent verification of every viewer. Do not falsify, edit, reuse or misrepresent evidence, violate WhatsApp rules, or post unsafe or unlawful content.",
      },
      {
        heading: "Withdrawals and changes",
        text: "Withdrawal requests are subject to balance, minimums, disclosed charges, processing limits, account review and M-Pesa availability. A withdrawal is marked Paid only after Safaricom confirms the M-Pesa payout. We may update these terms prospectively and retain records needed to investigate transactions.",
      },
    ],
  },
  "/privacy": {
    title: "Privacy Policy",
    intro:
      "This product stores account, task, evidence, payment-reference and support records to operate the platform. Confirm data-controller and retention obligations with qualified counsel before launch.",
    sections: [
      {
        heading: "Information collected",
        text: "Account details, contact and county information, M-Pesa withdrawal number, task submissions, uploaded evidence, referral attribution, withdrawal requests, payment provider references, security/audit events and support messages.",
      },
      {
        heading: "Why records are used",
        text: "To authenticate accounts, deliver work and advertising campaigns, review evidence, administer balances and withdrawals, prevent duplicate or suspicious activity, answer support requests and maintain an audit trail.",
      },
      {
        heading: "Service providers",
        text: "Safaricom Daraja processes payment prompts and transaction verification when credentials are configured. Object storage hosts approved campaign media and user-uploaded evidence. Brevo sends account emails such as verification codes, password resets and status updates.",
      },
      {
        heading: "Access and safety",
        text: "Passwords are hashed; provider secrets are kept server-side. Administrative access is role-gated and recorded. Members see their own records; advertisers receive limited reporting for their campaigns.",
      },
      {
        heading: "Requests and retention",
        text: "Contact support to ask about account data or corrections. Some payment, fraud-prevention and financial records may need to be retained even after an account changes or closes; operational retention periods must be finalized before launch.",
      },
    ],
  },
  "/payments": {
    title: "Payment Policy",
    intro:
      "Payment status changes are driven by server-side provider evidence. Never use an unconfirmed browser screen as proof of payment.",
    sections: [
      {
        heading: "Activation payment",
        text: "An eligible member initiates one KES 100 Daraja STK Push from the activation page. KaziFlow checks callback details against the stored amount and M-Pesa number and queries Daraja before activating an account. A pending, failed or mismatched payment does not activate the account.",
      },
      {
        heading: "Campaign funding",
        text: "An advertiser campaign stays inactive until its configured budget is fully funded and then approved by an administrator. Campaign spend is capped by the confirmed funding and campaign budget.",
      },
      {
        heading: "Receipts and investigation",
        text: "Keep the M-Pesa receipt and checkout reference. An unresolved or mismatched attempt is placed in administrator investigation; do not initiate another prompt while the attempt remains unresolved.",
      },
      {
        heading: "Withdrawals",
        text: "The current release does not initiate or finalize Safaricom B2C payouts. KaziFlow reserves the requested amount and allows an administrator to move it to Processing or reject it with a reason. The Paid state is locked until a payout provider can verify actual disbursement.",
      },
    ],
  },
  "/task-guidelines": {
    title: "Task Guidelines",
    intro:
      "Work only on activities whose instructions and eligibility you can meet.",
    sections: [
      {
        heading: "Read the whole brief",
        text: "Review the reward, time estimate, slot availability and exact completion requirements before starting. Submit original, relevant proof and do not use bots, multiple accounts or deceptive engagement.",
      },
      {
        heading: "Platform rules",
        text: "Social actions must be permitted by the relevant platform and advertiser; never purchase engagement or make misleading comments. Follow video and website instructions honestly. Do not disclose personal or financial information to strangers in chat-and-earn tasks.",
      },
      {
        heading: "Reviews",
        text: "Submissions can remain Pending while reviewed, then become Approved or Rejected with a reason where available. Rejected submissions do not earn a wallet credit.",
      },
    ],
  },
  "/advertising-guidelines": {
    title: "Advertising Guidelines",
    intro:
      "Advertisers must provide lawful, truthful and safe promotional content and confirm the audience and reward terms before funding.",
    sections: [
      {
        heading: "Campaign setup",
        text: "Set a rate per view, minimum and maximum payable views, budget, duration, participant cap, campaign reference and usable posting instructions. Budgets and campaign limits are enforced server-side.",
      },
      {
        heading: "Funding and approvals",
        text: "An STK prompt is not a funding confirmation. Campaigns activate only after Daraja confirms funding and an administrator approves the campaign.",
      },
      {
        heading: "Evidence and reporting",
        text: "Members submit screenshots and self-reported WhatsApp Status views. An administrator reviews the evidence; screenshots are not independent verification of every viewer. Strict review can be requested, but no external viewer-verification API is claimed.",
      },
      {
        heading: "Prohibited content",
        text: "No illegal, fraudulent, hateful, adult, exploitative, unsafe, misleading or unauthorized material; no deceptive earning claims, phishing, malware, financial impersonation or attempts to collect passwords, PINs or verification codes.",
      },
    ],
  },
  "/withdrawal-policy": {
    title: "Withdrawal Policy",
    intro:
      "Withdrawal requests reserve available funds immediately. A withdrawal is marked Paid only when Safaricom confirms the M-Pesa payout to your number.",
    sections: [
      {
        heading: "Eligibility and limits",
        text: "Your account must be activated, have a saved M-Pesa number and have enough available wallet balance. The administrator-configured minimum, single-request maximum, rolling 24-hour limit and disclosed charge are enforced before reservation.",
      },
      {
        heading: "Status lifecycle",
        text: "Pending means received and reserved. Processing means the payout was sent to M-Pesa and we are waiting for Safaricom's result. Paid means Safaricom confirmed it, with the M-Pesa receipt shown. Payout failed means M-Pesa did not complete it and your funds remain safe. Rejected means the reserve was returned to your available balance.",
      },
      {
        heading: "Review",
        text: "Provide an M-Pesa number registered in your own name. Changing the payout number requires your account password. Contact support with your withdrawal ID if a request remains unresolved.",
      },
    ],
  },
};

function PublicPolicy({ path }: { path: string }) {
  const policy = policyCopy[path];
  return (
    <div className="public-page">
      <header className="public-header">
        <Wordmark />
        <div className="header-actions">
          <a className="link-muted" href="/">
            Home
          </a>
          <a className="button button-primary button-small" href="/register">
            Create account
          </a>
        </div>
      </header>
      <main className="policy-page">
        <p className="eyebrow">
          <span />
          KaziFlow · Kenya
        </p>
        <h1>{policy.title}</h1>
        <p className="policy-intro">{policy.intro}</p>
        <div className="policy-sections">
          {policy.sections.map(section => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              <p>{section.text}</p>
            </section>
          ))}
        </div>
        <div className="notice">
          <ShieldCheck size={17} />
          <span>
            <strong>Product policy notice</strong>These product-facing terms are
            not legal advice or a claim of regulatory compliance. Final terms,
            licensing and data-retention requirements require qualified review.
          </span>
        </div>
        <a className="button button-outline" href="/">
          <ArrowLeft size={15} /> Return to KaziFlow
        </a>
        <AdSlot slot="policy" />
      </main>
      <footer className="policy-footer">
        <Wordmark inverse />
        <span>
          © {new Date().getFullYear()} KaziFlow · No guaranteed-income claims.
        </span>
      </footer>
    </div>
  );
}

function MissingPage() {
  return (
    <main className="app-content">
      <p className="page-eyebrow">Page not found</p>
      <h1>That route isn’t here.</h1>
      <a href="/" className="button-app secondary">
        Return home
      </a>
    </main>
  );
}

export default function KaziFlowApp() {
  const [location, setLocation] = useLocation();
  const path = location.split("?")[0] || "/";
  const authOnly = authPaths.includes(path);
  const policy = policyCopy[path];
  const publicRoute = authOnly || Boolean(policy) || path === "/404";
  const me = trpc.auth.me.useQuery(undefined, {
    enabled: !publicRoute || path === "/tasks",
    retry: false,
    staleTime: 5_000,
  });
  const theme = useTheme();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await me.refetch();
      setLocation("/login");
    },
  });

  useEffect(() => {
    if (publicRoute || path === "/tasks" || me.isLoading || me.data !== null) return;
    toast.info("Sign in to continue.");
    setLocation(`/login?next=${encodeURIComponent(location)}`);
  }, [location, me.data, me.isLoading, publicRoute, setLocation]);

  if (path === "/404") return <MissingPage />;
  if (policy) return <PublicPolicy path={path} />;
  if (authOnly) return <AuthPage path={path} />;
  // Visitors may browse tasks; starting one requires an account.
  if (path === "/tasks" && me.data === null) return <PublicTasks />;
  if (me.isLoading || me.data === undefined || !me.data)
    return (
      <div className="loading-page">
        <Wordmark />
        <span>Loading your workspace…</span>
      </div>
    );

  const user = me.data;
  if (path.startsWith("/admin")) {
    if (user.role !== "admin" && user.role !== "super_admin") {
      return (
        <div className="app-content">
          <div className="notice">
            <ShieldCheck size={17} />
            <span>
              <strong>Administrator access required</strong>This account does
              not have administrator permissions.
            </span>
          </div>
          <a className="button-app secondary" href="/dashboard" style={{ marginTop: 14, display: "inline-flex" }}>
            Back to my dashboard
          </a>
        </div>
      );
    }
    return <AdminPortal user={user} onLogout={() => logout.mutate()} />;
  }
  if (path.startsWith("/advertiser")) {
    if (
      user.accountType !== "advertiser" &&
      user.role !== "admin" &&
      user.role !== "super_admin"
    ) {
      return (
        <AppAccessPrompt
          onGo={() => setLocation("/register?type=advertiser")}
        />
      );
    }
    return <AdvertiserPortal user={user} onLogout={() => logout.mutate()} />;
  }
  const switchTheme = () => theme.toggleTheme?.();
  return (
    <MemberPortal
      user={user}
      onLogout={() => logout.mutate()}
      onToggleTheme={switchTheme}
    />
  );
}

function AppAccessPrompt({ onGo }: { onGo: () => void }) {
  return (
    <main className="app-content">
      <div className="page-intro">
        <div>
          <p className="page-eyebrow">Separate workspace</p>
          <h1>Open an advertiser account</h1>
          <p>Campaign tools are available to registered advertiser accounts.</p>
        </div>
      </div>
      <button className="button-app" onClick={onGo}>
        Create advertiser account
      </button>
    </main>
  );
}
