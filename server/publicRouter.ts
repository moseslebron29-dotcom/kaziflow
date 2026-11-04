import { publicProcedure, router } from "./_core/trpc";
import { settingValue } from "./security";

/** Public, non-sensitive site settings shown on the homepage and support page. */
export const publicRouter = router({
  info: publicProcedure.query(async () => ({
    activationFeeKes: Math.max(1, Number(await settingValue("activationFeeMinor", "10000")) / 100 || 100),
    minimumWithdrawalKes: Number(await settingValue("minimumWithdrawalMinor", "10000")) / 100,
    withdrawalFeeKes: Number(await settingValue("withdrawalFeeMinor", "0")) / 100,
    referralCommissionKes: Number(await settingValue("referralCommissionMinor", "0")) / 100,
    support: {
      email: await settingValue("supportEmail", ""),
      phone: await settingValue("supportPhone", ""),
      whatsapp: await settingValue("supportWhatsapp", ""),
      hours: await settingValue("supportHours", ""),
    },
    adsenseClientId: process.env.ADSENSE_CLIENT_ID?.match(/^ca-pub-\d{10,20}$/) ? process.env.ADSENSE_CLIENT_ID : null,
  })),
});
