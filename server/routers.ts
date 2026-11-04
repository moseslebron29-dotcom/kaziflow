import { router } from "./_core/trpc";
import { authRouter } from "./authRouter";
import { memberRouter } from "./memberRouter";
import { advertiserRouter } from "./advertiserRouter";
import { adminRouter } from "./adminRouter";
import { reviewRouter } from "./reviewRouter";
import { announcementRouter } from "./announcementRouter";
import { publicRouter } from "./publicRouter";

export const appRouter = router({
  auth: authRouter,
  member: memberRouter,
  advertiser: advertiserRouter,
  admin: adminRouter,
  reviews: reviewRouter,
  announcements: announcementRouter,
  site: publicRouter,
});

export type AppRouter = typeof appRouter;
