import { useMemo, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Check, Eye, FileCheck2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Wordmark } from "../components/Brand";
import { trpc } from "../lib/trpc";

const counties = ["Baringo","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Embu","Garissa","Homa Bay","Isiolo","Kajiado","Kakamega","Kericho","Kiambu","Kilifi","Kirinyaga","Kisii","Kisumu","Kitui","Kwale","Laikipia","Lamu","Machakos","Makueni","Mandera","Marsabit","Meru","Migori","Mombasa","Murang'a","Nairobi","Nakuru","Nandi","Narok","Nyamira","Nyandarua","Nyeri","Samburu","Siaya","Taita-Taveta","Tana River","Tharaka-Nithi","Trans Nzoia","Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot"];
const messageOf = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";

export default function AuthPage({ path }: { path: string }) {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState<Record<string, string>>({ accountType: new URLSearchParams(window.location.search).get("type") === "advertiser" ? "advertiser" : "member", county: "Nairobi" });
  const [error, setError] = useState("");
  const utils = trpc.useUtils();
  const appStatus = trpc.auth.status.useQuery();
  const setupStatus = trpc.auth.adminSetupStatus.useQuery(undefined, { enabled: path === "/admin/setup" });
  const resetToken = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);
  const next = useMemo(() => new URLSearchParams(window.location.search).get("next"), []);
  const goAfterLogin = async (accountType?: string) => {
    await utils.auth.me.invalidate();
    toast.success("Signed in securely.");
    setLocation(next?.startsWith("/") ? next : accountType === "advertiser" ? "/advertiser" : "/dashboard");
  };
  const register = trpc.auth.register.useMutation({ onSuccess: async (user) => { await utils.auth.me.invalidate(); toast.success("Your account is ready."); setLocation(user.accountType === "advertiser" ? "/advertiser" : "/dashboard"); }, onError: (err) => setError(err.message) });
  const login = trpc.auth.login.useMutation({ onSuccess: (user) => { void goAfterLogin(user.accountType); }, onError: (err) => setError(err.message) });
  const adminLogin = trpc.auth.adminLogin.useMutation({ onSuccess: () => { void goAfterLogin("admin"); }, onError: (err) => setError(err.message) });
  const bootstrap = trpc.auth.bootstrapAdmin.useMutation({ onSuccess: () => { void goAfterLogin("admin"); }, onError: (err) => setError(err.message) });
  const forgot = trpc.auth.forgotPassword.useMutation({ onSuccess: (result) => { setError(""); toast.success(result.message); }, onError: (err) => setError(err.message) });
  const reset = trpc.auth.resetPassword.useMutation({ onSuccess: () => { toast.success("Password updated. Sign in with your new password."); setLocation("/login"); }, onError: (err) => setError(err.message) });
  const verify = trpc.auth.verifyEmail.useMutation({ onSuccess: () => { toast.success("Email verified."); setLocation("/dashboard"); }, onError: (err) => setError(err.message) });

  const submit = (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (path === "/register") {
      if (form.password !== form.confirmPassword) { setError("Your passwords do not match."); return; }
      register.mutate({ name: form.name ?? "", email: form.email ?? "", phone: form.phone ?? "", county: form.county ?? "", password: form.password ?? "", accountType: form.accountType === "advertiser" ? "advertiser" : "member", referralCode: form.referralCode?.trim() || undefined });
    } else if (path === "/login") login.mutate({ email: form.email ?? "", password: form.password ?? "" });
    else if (path === "/admin/login") adminLogin.mutate({ email: form.email ?? "", password: form.password ?? "" });
    else if (path === "/admin/setup") {
      if (form.password !== form.confirmPassword) { setError("Your passwords do not match."); return; }
      bootstrap.mutate({ name: form.name ?? "", email: form.email ?? "", phone: form.phone ?? "", county: form.county ?? "", password: form.password ?? "", setupToken: form.setupToken ?? "" });
    } else if (path === "/forgot-password") forgot.mutate({ email: form.email ?? "" });
    else if (path === "/reset-password") reset.mutate({ token: resetToken, password: form.password ?? "" });
  };

  const isPending = register.isPending || login.isPending || adminLogin.isPending || bootstrap.isPending || forgot.isPending || reset.isPending || verify.isPending;
  const title = path === "/register" ? "An account built around clear steps." : path === "/admin/login" ? "Administrator sign in" : path === "/admin/setup" ? "Set up the primary administrator" : path === "/forgot-password" ? "Recover your account" : path === "/reset-password" ? "Choose a new password" : path === "/verify-email" ? "Verify your email" : "Good work starts with a clear brief.";
  const asideTitle = path === "/admin/login" || path === "/admin/setup" ? "Careful access for a careful ledger." : path === "/register" ? "Your work. Your evidence. Your record." : "Make each next step visible.";
  const countySelect = <label className="field"><span>County</span><select className="select" value={form.county ?? "Nairobi"} onChange={(e) => setForm({ ...form, county: e.target.value })}>{counties.map((county) => <option key={county} value={county}>{county}</option>)}</select></label>;
  const textInput = (key: string, label: string, placeholder: string, type = "text", required = true) => <label className="field" key={key}><span>{label}</span><input className="input" type={type} required={required} autoComplete={type === "password" ? "new-password" : undefined} placeholder={placeholder} value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>;

  if (path === "/verify-email") {
    return <div className="auth-page"><section className="auth-panel"><div className="auth-brand"><Wordmark /></div><p className="page-eyebrow">Account verification</p><h1>{title}</h1><p>Confirm the one-time link from your email provider. Email delivery is enabled only after mail settings are configured.</p>{!appStatus.data?.mailerReady ? <div className="notice"><ShieldCheck size={17} /><span><strong>Email delivery is not configured</strong>You can continue using the account; verification becomes available once the mail service is connected.</span></div> : <form className="form-stack" onSubmit={(event) => { event.preventDefault(); verify.mutate({ token: new URLSearchParams(window.location.search).get("token") ?? "" }); }}><button className="button-app" disabled={verify.isPending}>Verify email <Check size={15} /></button>{error && <p className="form-error">{error}</p>}</form>}<p className="auth-footer"><Link href="/dashboard">Return to dashboard</Link></p></section><aside className="auth-aside"><p className="eyebrow"><span />Account safety</p><h2>{asideTitle}</h2><p>One-time links expire and can be used once. Never share your password or M-Pesa PIN.</p></aside></div>;
  }

  return <div className="auth-page"><section className="auth-panel"><div className="auth-brand"><Wordmark /></div><p className="page-eyebrow">{path.startsWith("/admin") ? "KaziFlow operations" : "KaziFlow account"}</p><h1>{title}</h1><p>{path === "/register" ? "Set up a member or advertiser workspace. Unactivated members can explore, but must complete provider-confirmed activation before starting tasks." : path === "/admin/setup" ? "This one-time setup works only for the configured primary administrator email, setup token and session secret." : path === "/admin/login" ? "Administrator accounts use a separate sign-in route and role-checked server procedures." : path === "/forgot-password" ? "If email is configured, we will send a one-time recovery link." : path === "/reset-password" ? "Use a strong password of at least 10 characters." : "Sign in to see your real account, task status and wallet records."}</p>
    {path === "/admin/setup" && <div className="notice"><ShieldCheck size={17} /><span><strong>{setupStatus.data?.available ? "One-time setup is available" : "Primary-admin setup is not ready"}</strong>{setupStatus.data?.available ? "Only the configured admin email and protected setup token can complete this." : "The secure admin email, setup token, session secret, database or initial-setup state is not ready. No default password is provided."}</span></div>}
    {path === "/register" && <div className="form-stack" style={{ marginBottom: 16 }}><div className="field"><span>Choose workspace</span><div className="segmented"><button type="button" className={form.accountType === "member" ? "selected" : ""} onClick={() => setForm({ ...form, accountType: "member" })}>Member account</button><button type="button" className={form.accountType === "advertiser" ? "selected" : ""} onClick={() => setForm({ ...form, accountType: "advertiser" })}>Advertiser account</button></div></div></div>}
    {path === "/admin/setup" && !setupStatus.data?.available ? <p className="form-error">Contact the project owner to configure secure administrator setup. Do not share setup values in public chat.</p> : <form className="form-stack" onSubmit={submit}>
      {(path === "/register" || path === "/admin/setup") && <div className="field-grid">{textInput("name", "Full name", "Your name")}{textInput("email", "Email address", "name@example.com", "email")}{textInput("phone", "Phone number", "+254 7XX XXX XXX", "tel")}{countySelect}{path === "/register" && textInput("referralCode", "Referral code", "Optional code", "text", false)}{path === "/admin/setup" && textInput("setupToken", "One-time setup token", "Provided privately by the owner", "password")}</div>}
      {(path === "/login" || path === "/admin/login") && <div className="field-grid">{textInput("email", "Email address", "name@example.com", "email")}{textInput("password", "Password", "Your password", "password")}</div>}
      {(path === "/register" || path === "/admin/setup") && <div className="field-grid">{textInput("password", "Password", "At least 10 characters", "password")}{textInput("confirmPassword", "Confirm password", "Enter it again", "password")}</div>}
      {path === "/forgot-password" && textInput("email", "Email address", "name@example.com", "email")}
      {path === "/reset-password" && <>{!resetToken && <p className="form-error">This link is missing its one-time reset token. Request a fresh recovery email.</p>}{textInput("password", "New password", "At least 10 characters", "password")}</>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {(path === "/register" || path === "/login") && appStatus.data?.sessionReady === false && <p className="form-error">Account sessions are not configured yet. Contact the project owner.</p>}
      <button className="button-app" disabled={isPending || (path === "/register" && appStatus.data?.sessionReady === false) || (path === "/reset-password" && !resetToken) || (path === "/admin/setup" && !setupStatus.data?.available)}>{isPending ? "Please wait…" : path === "/register" ? "Create account" : path === "/login" ? "Sign in" : path === "/admin/login" ? "Sign in to admin" : path === "/admin/setup" ? "Create primary administrator" : path === "/forgot-password" ? "Send recovery link" : "Save new password"} <ArrowRight size={15} /></button>
      {path === "/admin/login" && <p className="auth-footer"><Link href="/admin/setup">Initial primary-admin setup</Link></p>}
      {path === "/register" && <p className="auth-footer">By creating an account, you agree to KaziFlow’s <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>. No earnings are guaranteed.</p>}
    </form>}
    {path === "/login" && <p className="auth-footer"><Link href="/forgot-password">Forgot your password?</Link> · <Link href="/admin/login">Administrator sign in</Link></p>}
    {path === "/forgot-password" && <p className="auth-footer"><Link href="/login">Return to sign in</Link></p>}
    {path === "/reset-password" && <p className="auth-footer"><Link href="/forgot-password">Request another reset link</Link></p>}
    {(path === "/register" || path === "/admin/setup") && <p className="auth-footer">Already registered? <Link href={path === "/admin/setup" ? "/admin/login" : "/login"}>Sign in</Link></p>}
  </section><aside className="auth-aside"><p className="eyebrow"><span />A practical work ledger</p><h2>{asideTitle}</h2><p>Task instructions, submission status, wallet entries and withdrawal receipts belong in one clear record.</p><div className="auth-trust"><ShieldCheck size={16} /> Provider-confirmed payments · Human-reviewed evidence</div><div className="auth-trust"><FileCheck2 size={16} /> No fabricated activity or guaranteed income claims</div></aside></div>;
}
