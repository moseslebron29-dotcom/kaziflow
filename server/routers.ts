import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { authRouter } from "./authRouter";
import { memberRouter } from "./memberRouter";
import { advertiserRouter } from "./advertiserRouter";
import { adminRouter } from "./adminRouter";
import { reviewRouter } from "./reviewRouter";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  member: memberRouter,
  advertiser: advertiserRouter,
  admin: adminRouter,
  reviews: reviewRouter,
});

export type AppRouter = typeof appRouter;
