# KaziFlow implementation outcomes

## 1. Original landing page, trust content and responsive product shell — Open
- Build a unique professional, mobile-first and responsive landing page and app navigation for Android, iPhone, tablets and computers, with practical light/dark mode if supported.
- Landing page includes professional navigation, hero, platform explanation, how it works, available earning categories, WhatsApp Status Ads explanation, how members earn, advertiser benefits, platform features, FAQs, contact/support and footer.
- Use realistic copy without exaggerated income claims. Do not create fake testimonials, withdrawal/payment screenshots, payment notifications, member counts, payment histories or user statistics.
- Include Terms and Conditions, Privacy Policy, Payment Policy, Task Guidelines, Advertising Guidelines, Withdrawal Policy and Support Centre. Do not represent draft policies as legal/compliance certification.
- Preserve an original brand and interface; do not copy the reference site’s branding, colours, layout, wording or exact design.

## 2. Member registration, secure sign-in and profile — Open
- Let users register with name, email, phone number and password, sign in securely, reset forgotten passwords, verify email when delivery is configured, manage their profiles and update their M-Pesa withdrawal number.
- Hash passwords server-side, validate on the server, rate-limit authentication actions, use protected application sessions and enforce ownership/role checks. Never store or expose raw passwords, reset tokens or provider credentials.
- Support unactivated users logging in and exploring the dashboard/categories. Route an unactivated user to the activation page whenever they click Start Task.

## 3. One-time KES 100 activation and Daraja payment records — Open
- Display the one-time KES 100 fee and let a user submit their M-Pesa number and initiate Daraja STK Push from the server.
- Activate only after a successful provider callback and server-side transaction verification. Do not activate based on frontend results. Make callback/payment processing idempotent, prevent duplicate attempts/credits, retain transaction references and provide member payment history.
- Give administrators a way to investigate failed/pending activation transactions. Activation is paid once only.
- Keep all Daraja credentials server-side in environment/secrets. Where credentials or public callback configuration are absent, clearly show setup-required status, fail safely and never simulate success or grant activation. Do not claim live STK Push until it is configured and confirmed.

## 4. Task marketplace and member task submissions — Open
- Provide categories for online surveys; video watching with legitimate completion checks; social-media follows, likes, shares, comments and other approved activities; website visits and specified activities; simple microtasks with clear instructions; legitimate chat-and-earn opportunities with safety guidance; approved content-writing assignments; referrals; configurable daily activities/bonuses; administrator-published special promotions; and configured task promotions.
- Every task shows its title, description, reward in KES, estimated completion time, available slots, instructions, start action, completion requirements and status.
- Only activated members can start tasks. Record attempts/submissions and show pending/approved/rejected status. Use available evidence/review rules; do not misrepresent client-side events as independent proof of another platform’s actions or of a human view.

## 5. WhatsApp Status Ads marketplace, evidence and approval — Open
- Make WhatsApp Status Ads a major member earning category. Advertisers/admins can submit/create campaigns; activated members can browse eligible campaigns.
- Each campaign shows advertiser name, image/video, description, payment per eligible view, minimum views, duration, available slots, posting instructions and campaign reference.
- Members can open/download campaign material, post it on their WhatsApp Status, and submit the campaign reference/date, a screenshot of the posted status and a screenshot of status insights/views.
- Send every submission to an administrator verification queue. Provide administrator review, reject/approve actions and durable review records. Credit only after approval.
- Let administrators configure rate per view, minimum views, maximum payable views, campaign budget, duration and participating-member count. Calculate the eligible reward automatically on the server, cap it at configured limits and campaign budget, and credit the wallet transactionally only after approval.
- Prevent duplicate submissions, detect reused evidence files, retain verification records, support rejection of suspicious submissions and apply campaign view/budget limits. Let advertisers select stricter verification requirements.
- Clearly explain that WhatsApp screenshots are member-submitted evidence and are not independent verification of every viewer. Do not portray screenshot views as independently verified unless a stricter, real verification method establishes that.

## 6. Wallet, transaction history and withdrawals — Open
- Show total balance, available balance, pending earnings, lifetime earnings, completed tasks, pending submissions, referral earnings, recent transactions and full transaction history from actual records, not seeded fabricated values.
- Support M-Pesa withdrawals. Administrators can configure minimum withdrawal, charges, processing limits and approval settings.
- Withdrawal flow: member enters amount, selects the registered M-Pesa number and submits; server checks available balance and reserves the amount transactionally to prevent double withdrawals; admin reviews; approved requests are processed and transaction status is updated.
- Support Pending, Processing, Paid and Rejected states. Do not mark a request Paid without confirmation of an actual payout and its provider receipt/reference. Release/reconcile reservations correctly on rejection, cancellation or verified payout.

## 7. Referrals, daily rewards and promotions — Open
- Give each user a unique referral link and referral dashboard showing total referrals, activated referrals, referral commissions and referral transaction history.
- Let administrators configure referral commission amounts and eligibility rules; record attribution and commission once, with duplicate prevention.
- Support configurable daily activities/bonuses and admin-created special promotions with eligibility, availability and reward settings; do not claim a reward until its rule is fulfilled and approved as configured.

## 8. Advertiser portal and campaign funding — Open
- Provide a separate advertiser registration/interface. Businesses can create advertising campaigns, upload promotional materials, set campaign budgets and payment per verified view, monitor campaign performance, view participating members, track verified views and campaign spending.
- Campaigns must not become active until their funding is confirmed. Track funding, budget reservations, spend and campaign status from persisted records; do not fabricate impressions, participants or funding confirmations.

## 9. Administrator dashboard and auditability — Open
- User management: view/search registered users, suspend accounts, activate only after verified payment, and inspect user transaction histories.
- Task management: create/edit/delete tasks, set rewards and limits, review submissions and approve/reject them.
- WhatsApp advertising management: create campaigns and upload media, set rate/budget/max views, manage members, review submitted evidence, approve/reject, and track campaign spending.
- Payment management: view activation payments, monitor M-Pesa transactions, review/approve/reject withdrawals and inspect transaction references.
- Reviews management: search/filter member reviews, including by rating; approve, reject with reason, and delete inappropriate reviews. Only approved feedback appears publicly.
- System settings: configure activation fee, task rewards, minimum withdrawals, withdrawal charges/limits, referral commissions, advertising rates and campaign limits.
- Create the secure primary SUPER ADMIN account for the user-specified email `moseslebron29@gmail.com` via `ADMIN_EMAIL`; use a separate administrator login; provide secure one-time password setup, never a hardcoded default password. Permit only the primary super-admin to manage additional administrators; ordinary users cannot self-assign privileges.
- Protect administrator actions with server-side authorization and durable audit records; do not rely on hidden buttons as access control.

## 10. Member reviews and honest launch demonstration cards — Open
- Add a homepage section near the bottom titled “WHAT OUR MEMBERS SAY” with subtitle “Real experiences and feedback from the KaziFlow community.” Show approximately 10 attractive, responsive, five-star review cards with names, Kenyan county labels and review dates.
- Launch card sample names/counties: Brian Mwangi — Nairobi County; Faith Atieno — Kisumu County; Kevin Kiptoo — Uasin Gishu County; Mary Wanjiku — Kiambu County; Dennis Otieno — Siaya County; Sharon Chebet — Nakuru County; Peter Kamau — Nyeri County; Mercy Naliaka — Bungoma County; Samuel Mutua — Machakos County; Diana Akinyi — Mombasa County.
- Sample review wording may discuss ease of using KaziFlow, available tasks, website experience, support, WhatsApp advertising or M-Pesa withdrawal steps. Label all initial sample names, counties, dates and text clearly as demonstration content—not genuine customer testimonials, verified customers, actual withdrawals or actual member experiences—and replace them with real member feedback only after moderation approval.
- Registered members can submit a rating from 1 to 5 stars and a review; enforce one initial review per member, allow edits, apply spam limits, store it in the database and send it to administrator moderation. Approved reviews display member name and county publicly; rejected/unapproved reviews do not. Never display a verified-member badge unless verification is genuine.

## 11. Landing-page sequence and member-facing contact — Open
- Homepage section order: professional navigation; hero; how KaziFlow works; earning opportunities; WhatsApp Status Ads; why choose KaziFlow; how M-Pesa withdrawals work; member reviews; FAQs; contact/support; professional footer.
- Include clear registration and login controls, and a private logged-in account support-ticket flow. Do not invent a support address or pretend that external email delivery is configured.
- Keep marketing honest: do not promise income, imply that sample reviews are real, or fabricate payment claims.

## 12. Database integrity, security and integration behavior — Open
- Use the existing React/Express/tRPC/Drizzle/MySQL project and managed server/database. Add durable relational schema and non-destructive migrations for accounts, authentication, tasks/submissions, advertisers/campaigns/evidence/funding, Daraja transactions/callbacks, wallet/ledger/holds, withdrawals, referrals, settings and audit events.
- Use server-side validation, secure role and ownership middleware, database transactions, idempotency, unique provider references, secure upload authorization/size/type checks, rate limiting, duplicate submission prevention and audit logs.
- Use durable file/object storage for campaign media and screenshots; store ownership/index metadata in the database. Never commit credentials or expose them in client code.
- Keep development and production data safe; do not seed fake financial records or run destructive database operations.

## 13. Project documentation and deployment handoff — Open
- Provide complete source, database schema and migrations, `.env.example` with placeholder names only, installation steps, deployment steps, API documentation and integration setup notes.
- Document actual supported/required Daraja settings, public callback configuration, Brevo transactional-email requirements, payout confirmation and WhatsApp screenshot evidence limitations.
- Never describe payments, email delivery, payout or viewer verification as live when the required external integration is not configured.

## 14. Responsive implementation and major-flow validation — Open
- Ensure the member, advertiser and administrator journeys and forms are usable at Android phone widths and remain usable on larger screens.
- Test member registration/login/profile; browse task listings; verify that an inactive member is sent to activation from Start Task; test a provider-confirmed activation only where a safe Daraja sandbox and valid callback are configured; submit and review task evidence; verify approved credit; submit WhatsApp screenshots and verify approved-view caps and wallet credit; test advertiser campaign creation, funding gating, limits and reporting; test withdrawal reservation/rejection/actual payout recording; test referral tracking; review moderation; role-gated admin actions, settings, search and support; and route navigation.
- Test advertiser registration, campaign creation, media upload, campaign funding prompt, performance and spend tracking. Do not simulate provider success.
- Validate source/type/build checks and route declarations, then fix found errors. Avoid tests that create fabricated live payments or mutate real member balances. Report any integration flows that cannot be end-to-end tested without real credentials/provider callbacks.

## 15. Persistent production data, authentication and backup readiness — Open
- Use a persistent production database, preferably PostgreSQL.
- Ensure user accounts and all financial records remain saved after server restarts and redeployment.
- Implement secure email-and-password registration and login.
- Hash passwords securely. Never store plain-text passwords.
- Implement email verification and password reset using Brevo.
- Ensure login sessions work correctly on Android and desktop.
- Ensure admin accounts and permissions are stored securely.
- Confirm that the database is supported by the intended Manus hosting environment.
- Explain how database backups and migrations will work.
- Do not use temporary JSON files or in-memory storage for financial records or user accounts.
- Before publishing, report which database provider is configured and whether it remains persistent after publishing; do not imply publication or backups are automatic.
