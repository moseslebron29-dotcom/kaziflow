import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Check, FileCheck2, MailCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Wordmark } from "../components/Brand";
import VisitorAd from "../components/VisitorAd";
import { trpc } from "../lib/trpc";
import { KENYA_COUNTIES } from "@shared/counties";

const RESEND_SECONDS = 60;

function useCooldown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (until <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [until]);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  return { left, start: (seconds = RESEND_SECONDS) => { setUntil(Date.now() + seconds * 1000); setNow(Date.now()); } };
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      className="input otp-input"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      maxLength={6}
      required
      aria-label="Six-digit code"
      placeholder="••••••"
      value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
    />
  );
}

function AuthAside({ title }: { title: string }) {
  return (
    <aside className="auth-aside">
      <p className="eyebrow">
        <span />A practical work ledger
      </p>
      <h2>{title}</h2>
      <p>Task instructions, submission status, wallet entries and M-Pesa receipts in one clear record.</p>
      <div className="auth-trust">
        <ShieldCheck size={16} /> M-Pesa payments confirmed by Safaricom
      </div>
      <div className="auth-trust">
        <FileCheck2 size={16} /> Every reward reviewed before it reaches your wallet
      </div>
    </aside>
  );
}

function VerifyEmail() {
  const [, setLocation] = useLocation();
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const cooldown = useCooldown();
  const sent = useMemo(() => new URLSearchParams(window.location.search).get("sent") === "1", []);
  useEffect(() => {
    if (sent) cooldown.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent]);
  useEffect(() => {
    if (me.data === null) setLocation(`/login?next=${encodeURIComponent("/verify-email")}`);
  }, [me.data, setLocation]);
  const resend = trpc.auth.sendVerificationCode.useMutation({
    onSuccess: r => {
      if (r.alreadyVerified) return void setLocation("/dashboard");
      toast.success("A new code is on its way. Check your inbox and spam folder.");
      cooldown.start();
    },
    onError: e => {
      setError(e.message);
      const wait = /wait (\d+) seconds/.exec(e.message)?.[1];
      if (wait) cooldown.start(Number(wait));
    },
  });
  const verify = trpc.auth.verifyEmailCode.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("Email verified. Karibu KaziFlow!");
      setLocation(me.data?.accountType === "advertiser" ? "/advertiser" : "/activate");
    },
    onError: e => setError(e.message),
  });
  const verified = Boolean(me.data?.emailVerifiedAt);
  return (
    <div className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand">
          <Wordmark />
        </div>
        <p className="page-eyebrow">Step 2 of 3 · Verify email</p>
        <h1>{verified ? "Your email is verified." : "Enter your six-digit code."}</h1>
        {verified ? (
          <>
            <p>You're all set.</p>
            <Link className="button-app" href={me.data?.accountType === "advertiser" ? "/advertiser" : "/activate"}>
              Continue <ArrowRight size={15} />
            </Link>
          </>
        ) : (
          <>
            <p>
              We sent a code to <b>{me.data?.email ?? "your email"}</b>. It expires in 10 minutes. You have 5 attempts per code.
            </p>
            <form
              className="form-stack"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                setError("");
                verify.mutate({ code });
              }}
            >
              <label className="field">
                <span>Verification code</span>
                <CodeInput value={code} onChange={setCode} />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button-app" disabled={code.length !== 6 || verify.isPending}>
                {verify.isPending ? "Checking…" : "Verify email"} <Check size={15} />
              </button>
            </form>
            <p className="auth-footer">
              Didn't get it?{" "}
              <button type="button" className="link-button" disabled={cooldown.left > 0 || resend.isPending} onClick={() => { setError(""); resend.mutate(); }}>
                {cooldown.left > 0 ? `Resend in ${cooldown.left}s` : resend.isPending ? "Sending…" : "Send a new code"}
              </button>
            </p>
          </>
        )}
        <p className="auth-footer">
          <Link href="/dashboard">Go to dashboard</Link>
        </p>
      </section>
      <aside className="auth-aside">
        <p className="eyebrow">
          <span />
          Account safety
        </p>
        <h2>Your code is private.</h2>
        <p>KaziFlow staff will never ask for your verification code, password or M-Pesa PIN.</p>
        <div className="auth-trust">
          <MailCheck size={16} /> Check your spam or promotions folder if the email is late.
        </div>
      </aside>
    </div>
  );
}

function ResetPassword({ presetEmail }: { presetEmail: string }) {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState(presetEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const cooldown = useCooldown();
  useEffect(() => {
    if (presetEmail) cooldown.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetEmail]);
  const forgot = trpc.auth.forgotPassword.useMutation({ onSuccess: r => { toast.success(r.message); cooldown.start(); }, onError: e => setError(e.message) });
  const reset = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("Password updated. Sign in with your new password.");
      setLocation("/login");
    },
    onError: e => setError(e.message),
  });
  return (
    <div className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand">
          <Wordmark />
        </div>
        <p className="page-eyebrow">Password reset</p>
        <h1>Choose a new password.</h1>
        <p>Enter the six-digit code we emailed you and your new password.</p>
        <form
          className="form-stack"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setError("");
            if (password !== confirm) return setError("Your passwords do not match.");
            reset.mutate({ email, code, password });
          }}
        >
          <label className="field">
            <span>Email address</span>
            <input className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label className="field">
            <span>Reset code</span>
            <CodeInput value={code} onChange={setCode} />
          </label>
          <div className="field-grid">
            <label className="field">
              <span>New password</span>
              <input className="input" type="password" required minLength={8} autoComplete="new-password" placeholder="8+ characters, letters and numbers" value={password} onChange={e => setPassword(e.target.value)} />
            </label>
            <label className="field">
              <span>Confirm password</span>
              <input className="input" type="password" required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} />
            </label>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button-app" disabled={reset.isPending || code.length !== 6}>
            {reset.isPending ? "Saving…" : "Save new password"} <ArrowRight size={15} />
          </button>
        </form>
        <p className="auth-footer">
          <button type="button" className="link-button" disabled={!email || cooldown.left > 0 || forgot.isPending} onClick={() => { setError(""); forgot.mutate({ email }); }}>
            {cooldown.left > 0 ? `Send another code in ${cooldown.left}s` : "Send another code"}
          </button>{" "}
          · <Link href="/login">Back to sign in</Link>
        </p>
      </section>
      <AuthAside title="Make each next step visible." />
    </div>
  );
}

export default function AuthPage({ path }: { path: string }) {
  const [, setLocation] = useLocation();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [form, setForm] = useState<Record<string, string>>({
    accountType: params.get("type") === "advertiser" ? "advertiser" : "member",
    county: "Nairobi",
    referralCode: params.get("ref") ?? "",
  });
  const [error, setError] = useState("");
  const utils = trpc.useUtils();
  const appStatus = trpc.auth.status.useQuery();
  const setupStatus = trpc.auth.adminSetupStatus.useQuery(undefined, { enabled: path === "/admin/setup" });
  const next = params.get("next");
  const afterLogin = async (user: { accountType: string; role: string; emailVerifiedAt?: Date | string | null }, admin = false) => {
    await utils.auth.me.invalidate();
    toast.success("Signed in.");
    if (!admin && !user.emailVerifiedAt) return setLocation("/verify-email");
    setLocation(next?.startsWith("/") && !next.startsWith("//") ? next : admin ? "/admin" : user.accountType === "advertiser" ? "/advertiser" : "/dashboard");
  };
  const register = trpc.auth.register.useMutation({
    onSuccess: async ({ codeSent }) => {
      await utils.auth.me.invalidate();
      toast.success(codeSent ? "Account created. Check your email for a six-digit code." : "Account created. Request your verification code on the next screen.");
      setLocation(codeSent ? "/verify-email?sent=1" : "/verify-email");
    },
    onError: err => setError(err.message),
  });
  const login = trpc.auth.login.useMutation({ onSuccess: u => void afterLogin(u), onError: err => setError(err.message) });
  const adminLogin = trpc.auth.adminLogin.useMutation({ onSuccess: u => void afterLogin(u, true), onError: err => setError(err.message) });
  const bootstrap = trpc.auth.bootstrapAdmin.useMutation({ onSuccess: u => void afterLogin(u, true), onError: err => setError(err.message) });
  const forgot = trpc.auth.forgotPassword.useMutation({
    onSuccess: r => {
      toast.success(r.message);
      setLocation(`/reset-password?email=${encodeURIComponent(form.email ?? "")}`);
    },
    onError: err => setError(err.message),
  });

  if (path === "/verify-email") return <VerifyEmail />;
  if (path === "/reset-password") return <ResetPassword presetEmail={new URLSearchParams(window.location.search).get("email") ?? form.email ?? ""} />;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (path === "/register") {
      if (form.password !== form.confirmPassword) return setError("Your passwords do not match.");
      register.mutate({
        name: form.name ?? "",
        email: form.email ?? "",
        phone: form.phone ?? "",
        county: form.county ?? "",
        password: form.password ?? "",
        accountType: form.accountType === "advertiser" ? "advertiser" : "member",
        businessName: form.accountType === "advertiser" ? form.businessName?.trim() : undefined,
        referralCode: form.accountType === "member" ? form.referralCode?.trim() || undefined : undefined,
      });
    } else if (path === "/login") login.mutate({ email: form.email ?? "", password: form.password ?? "" });
    else if (path === "/admin/login") adminLogin.mutate({ email: form.email ?? "", password: form.password ?? "" });
    else if (path === "/admin/setup") {
      if (form.password !== form.confirmPassword) return setError("Your passwords do not match.");
      bootstrap.mutate({ name: form.name ?? "", email: form.email ?? "", phone: form.phone ?? "", county: form.county ?? "", password: form.password ?? "", setupToken: form.setupToken ?? "" });
    } else if (path === "/forgot-password") forgot.mutate({ email: form.email ?? "" });
  };

  const isPending = register.isPending || login.isPending || adminLogin.isPending || bootstrap.isPending || forgot.isPending;
  const title =
    path === "/register"
      ? "Create your KaziFlow account."
      : path === "/admin/login"
        ? "Administrator sign in"
        : path === "/admin/setup"
          ? "Set up the primary administrator"
          : path === "/forgot-password"
            ? "Forgot your password?"
            : "Karibu tena. Sign in.";
  const countySelect = (
    <label className="field">
      <span>County</span>
      <select className="select" value={form.county ?? "Nairobi"} onChange={e => setForm({ ...form, county: e.target.value })}>
        {KENYA_COUNTIES.map(county => (
          <option key={county} value={county}>
            {county}
          </option>
        ))}
      </select>
    </label>
  );
  const textInput = (key: string, label: string, placeholder: string, type = "text", required = true, autoComplete?: string) => (
    <label className="field" key={key}>
      <span>{label}</span>
      <input
        className="input"
        type={type}
        required={required}
        autoComplete={autoComplete ?? (type === "password" ? (path === "/login" || path === "/admin/login" ? "current-password" : "new-password") : undefined)}
        inputMode={type === "tel" ? "tel" : undefined}
        placeholder={placeholder}
        value={form[key] ?? ""}
        onChange={e => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );
  const description =
    path === "/register"
      ? "Step 1 of 3. Register, verify your email with a six-digit code, then activate once with KES 100 via M-Pesa to start earning."
      : path === "/admin/setup"
        ? "This one-time setup works only for the configured primary administrator email and private setup token."
        : path === "/admin/login"
          ? "Administrator accounts use a separate sign-in and role-checked server actions."
          : path === "/forgot-password"
            ? "Enter your email and we'll send you a six-digit reset code."
            : "Sign in to see your tasks, submissions and wallet.";

  return (
    <div className="auth-page">
      {path === "/register" && <VisitorAd placement="signup" />}
      <section className="auth-panel">
        <div className="auth-brand">
          <Wordmark />
        </div>
        <p className="page-eyebrow">{path.startsWith("/admin") ? "KaziFlow operations" : "KaziFlow account"}</p>
        <h1>{title}</h1>
        <p>{description}</p>
        {path === "/admin/setup" && (
          <div className="notice">
            <ShieldCheck size={17} />
            <span>
              <strong>{setupStatus.data?.available ? "One-time setup is available" : "Primary-admin setup is not available"}</strong>
              {setupStatus.data?.available
                ? "Only the configured admin email and the private setup token can complete this."
                : "Either setup is already complete, or ADMIN_EMAIL / KAZIFLOW_ADMIN_BOOTSTRAP_TOKEN / KAZIFLOW_SESSION_SECRET are not configured on the server."}
            </span>
          </div>
        )}
        {path === "/register" && (
          <div className="form-stack" style={{ marginBottom: 16 }}>
            <div className="field">
              <span>I want to</span>
              <div className="segmented">
                <button type="button" className={form.accountType === "member" ? "selected" : ""} onClick={() => setForm({ ...form, accountType: "member" })}>
                  Earn as a member
                </button>
                <button type="button" className={form.accountType === "advertiser" ? "selected" : ""} onClick={() => setForm({ ...form, accountType: "advertiser" })}>
                  Advertise my business
                </button>
              </div>
            </div>
          </div>
        )}
        {path === "/admin/setup" && !setupStatus.data?.available ? (
          <p className="form-error">Contact the project owner to configure secure administrator setup.</p>
        ) : (
          <form className="form-stack" onSubmit={submit}>
            {(path === "/register" || path === "/admin/setup") && (
              <div className="field-grid">
                {textInput("name", "Full name", "e.g. Wanjiku Njeri", "text", true, "name")}
                {textInput("email", "Email address", "name@example.com", "email", true, "email")}
                {textInput("phone", "Phone number", "07XX XXX XXX", "tel", true, "tel")}
                {countySelect}
                {path === "/register" && form.accountType === "advertiser" && textInput("businessName", "Business or brand name", "e.g. Mama Mboga Fresh")}
                {path === "/register" && form.accountType === "member" && textInput("referralCode", "Referral code (optional)", "e.g. 4F2A9C1B", "text", false)}
                {path === "/admin/setup" && textInput("setupToken", "One-time setup token", "Provided privately by the owner", "password")}
              </div>
            )}
            {(path === "/login" || path === "/admin/login") && (
              <div className="field-grid">
                {textInput("email", "Email address", "name@example.com", "email", true, "email")}
                {textInput("password", "Password", "Your password", "password")}
              </div>
            )}
            {(path === "/register" || path === "/admin/setup") && (
              <div className="field-grid">
                {textInput("password", "Password", "8+ characters, letters and numbers", "password")}
                {textInput("confirmPassword", "Confirm password", "Enter it again", "password")}
              </div>
            )}
            {path === "/forgot-password" && textInput("email", "Email address", "name@example.com", "email", true, "email")}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {(path === "/register" || path === "/login") && appStatus.data?.sessionReady === false && (
              <p className="form-error">Sign-in is not configured on the server yet. Contact the site owner.</p>
            )}
            {path === "/register" && appStatus.data && !appStatus.data.mailerReady && (
              <p className="small-muted">Email delivery is not configured yet, so verification codes cannot be sent at the moment.</p>
            )}
            <button className="button-app" disabled={isPending || (path === "/register" && appStatus.data?.sessionReady === false) || (path === "/admin/setup" && !setupStatus.data?.available)}>
              {isPending
                ? "Please wait…"
                : path === "/register"
                  ? "Create account"
                  : path === "/login"
                    ? "Sign in"
                    : path === "/admin/login"
                      ? "Sign in to admin"
                      : path === "/admin/setup"
                        ? "Create primary administrator"
                        : "Send reset code"}{" "}
              <ArrowRight size={15} />
            </button>
            {path === "/admin/login" && (
              <p className="auth-footer">
                <Link href="/admin/setup">Initial primary-admin setup</Link>
              </p>
            )}
            {path === "/register" && (
              <p className="auth-footer">
                By creating an account you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>. Earnings are never guaranteed.
              </p>
            )}
          </form>
        )}
        {path === "/login" && (
          <p className="auth-footer">
            <Link href="/forgot-password">Forgot your password?</Link> · New here? <Link href="/register">Create an account</Link>
          </p>
        )}
        {path === "/forgot-password" && (
          <p className="auth-footer">
            Have a code? <Link href="/reset-password">Enter it here</Link> · <Link href="/login">Back to sign in</Link>
          </p>
        )}
        {(path === "/register" || path === "/admin/setup") && (
          <p className="auth-footer">
            Already registered? <Link href={path === "/admin/setup" ? "/admin/login" : "/login"}>Sign in</Link>
          </p>
        )}
      </section>
      <AuthAside title={path.startsWith("/admin") ? "Careful access for a careful ledger." : path === "/register" ? "Your work. Your evidence. Your record." : "Make each next step visible."} />
    </div>
  );
}
