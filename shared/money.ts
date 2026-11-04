export function formatKesMinor(minor: number | null | undefined) {
  return `KES ${((Number(minor) || 0) / 100).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * WhatsApp Status reward: only administrator-approved views count, capped by the
 * campaign maximum and by the funded budget still unspent.
 */
export function whatsappReward(input: {
  approvedViews: number;
  minimumViews: number;
  maximumPayableViews: number;
  rateMinor: number;
  budgetRemainingMinor: number;
}) {
  if (input.approvedViews < input.minimumViews || input.rateMinor <= 0) return { payableViews: 0, rewardMinor: 0 };
  const affordable = Math.floor(Math.max(0, input.budgetRemainingMinor) / input.rateMinor);
  const payableViews = Math.min(input.approvedViews, input.maximumPayableViews, affordable);
  if (payableViews < input.minimumViews) return { payableViews: 0, rewardMinor: 0 };
  return { payableViews, rewardMinor: payableViews * input.rateMinor };
}

/** Withdrawal checks shared by the server and tests. Amounts are minor units. */
export function withdrawalCheck(input: { amountMinor: number; availableMinor: number; minimumMinor: number; maximumMinor: number; feeMinor: number }) {
  if (input.amountMinor < input.minimumMinor) return { ok: false as const, reason: `Minimum withdrawal is ${formatKesMinor(input.minimumMinor)}.` };
  if (input.amountMinor <= input.feeMinor) return { ok: false as const, reason: "The amount must be more than the withdrawal fee." };
  if (input.amountMinor > input.maximumMinor) return { ok: false as const, reason: `Maximum single withdrawal is ${formatKesMinor(input.maximumMinor)}.` };
  if (input.amountMinor > input.availableMinor) return { ok: false as const, reason: "Available balance is not enough for this withdrawal." };
  return { ok: true as const, payoutMinor: input.amountMinor - input.feeMinor };
}

/** Plain-language reason for a Safaricom STK result code shown to the member. */
export function mpesaFailureReason(resultCode: string | number | null | undefined) {
  switch (String(resultCode ?? "")) {
    case "1":
      return "Your M-Pesa balance was not enough. Top up and try again.";
    case "1032":
      return "The M-Pesa prompt was cancelled. You can try again.";
    case "1037":
      return "Your phone could not be reached. Make sure it is on and has network, then try again.";
    case "2001":
      return "The M-Pesa PIN was wrong. Try again with the correct PIN.";
    case "1019":
      return "The M-Pesa prompt expired. You can try again.";
    case "1001":
      return "Another M-Pesa payment was in progress on your phone. Wait a minute, then try again.";
    case "1025":
    case "9999":
      return "Safaricom could not send the prompt to your phone. Wait a minute, then try again.";
    default:
      return "No money was taken, or the prompt was cancelled. You can try again.";
  }
}
