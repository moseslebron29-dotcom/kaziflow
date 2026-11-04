/**
 * KaziFlow task catalogue. Categories are stored as plain text in PostgreSQL so new
 * categories can be added here without a database enum migration.
 */
export const TASK_GROUPS = [
  { id: "social", label: "Social Media Tasks" },
  { id: "online", label: "Online Tasks" },
  { id: "entertainment", label: "Entertainment & Interactive" },
  { id: "other", label: "Other Earning Opportunities" },
] as const;

export type TaskGroupId = (typeof TASK_GROUPS)[number]["id"];

export const TASK_CATEGORIES = [
  // A. Social media
  { id: "tiktok", group: "social", label: "TikTok", hint: "Likes, follows, comments and video engagement" },
  { id: "youtube", group: "social", label: "YouTube", hint: "Subscriptions, likes and comments" },
  { id: "instagram", group: "social", label: "Instagram", hint: "Follows, likes, comments and engagement" },
  { id: "facebook", group: "social", label: "Facebook", hint: "Page follows, likes and engagement" },
  { id: "twitter", group: "social", label: "X / Twitter", hint: "Follows, likes and reposts" },
  { id: "telegram", group: "social", label: "Telegram", hint: "Channel joining and engagement" },
  // B. Online
  { id: "survey", group: "online", label: "Online Surveys", hint: "Share honest opinions in short surveys" },
  { id: "website_visit", group: "online", label: "Website Visits", hint: "Visit a page and complete the stated activity" },
  { id: "app_testing", group: "online", label: "App Testing", hint: "Install, test and report on apps" },
  { id: "product_review", group: "online", label: "Product Reviews", hint: "Genuine feedback after real use" },
  { id: "data_entry", group: "online", label: "Data Entry", hint: "Accurate entry of provided information" },
  { id: "typing", group: "online", label: "Typing Tasks", hint: "Transcribe or type supplied text" },
  { id: "copywriting", group: "online", label: "Copywriting", hint: "Short original marketing copy" },
  { id: "translation", group: "online", label: "Translation", hint: "English, Kiswahili and other languages" },
  { id: "research", group: "online", label: "Simple Research", hint: "Find and summarise public information" },
  { id: "image_categorization", group: "online", label: "Image Categorization", hint: "Label and sort images" },
  { id: "content_moderation", group: "online", label: "Content Moderation", hint: "Flag content against clear rules" },
  // C. Entertainment & interactive
  { id: "video", group: "entertainment", label: "Watch Videos", hint: "Watch and answer about a video" },
  { id: "quiz", group: "entertainment", label: "Educational Quizzes", hint: "Answer learning questions" },
  { id: "trivia", group: "entertainment", label: "Trivia Challenges", hint: "Test your general knowledge" },
  { id: "games", group: "entertainment", label: "Games & Competitions", hint: "Play and compete as instructed" },
  { id: "daily_reward", group: "entertainment", label: "Daily Rewards", hint: "Repeatable daily activities" },
  // D. Other
  { id: "chat_writing", group: "other", label: "Chat & Writing", hint: "Conversation and writing assignments" },
  { id: "referral", group: "other", label: "Referral Tasks", hint: "Invite friends using your referral link" },
  { id: "whatsapp_status", group: "other", label: "WhatsApp Status Ads", hint: "Post advertiser content on your Status" },
  { id: "promotion", group: "other", label: "Promotional Campaigns", hint: "Brand promotions with clear rules" },
  { id: "limited_time", group: "other", label: "Limited-Time Tasks", hint: "Special tasks with a deadline" },
  { id: "sponsored", group: "other", label: "Sponsored Tasks", hint: "Tasks funded by advertisers" },
] as const;

export type TaskCategoryId = (typeof TASK_CATEGORIES)[number]["id"];
export const TASK_CATEGORY_IDS = TASK_CATEGORIES.map(c => c.id) as unknown as [TaskCategoryId, ...TaskCategoryId[]];

export const COMPLETION_MODES = ["manual", "video_progress", "link_visit", "quiz"] as const;
export type CompletionMode = (typeof COMPLETION_MODES)[number];

export function categoryLabel(id: string) {
  return TASK_CATEGORIES.find(c => c.id === id)?.label ?? id.replaceAll("_", " ");
}
export function categoryGroup(id: string): TaskGroupId {
  return (TASK_CATEGORIES.find(c => c.id === id)?.group ?? "other") as TaskGroupId;
}

export type QuizQuestion = { question: string; options: string[]; answerIndex: number };

/** Parses admin-supplied quiz JSON and rejects malformed questions. */
export function parseQuiz(raw: string | null | undefined): QuizQuestion[] {
  if (!raw) return [];
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(data)) return [];
  return data
    .filter((q): q is QuizQuestion =>
      !!q && typeof q === "object" &&
      typeof (q as QuizQuestion).question === "string" &&
      Array.isArray((q as QuizQuestion).options) &&
      (q as QuizQuestion).options.length >= 2 &&
      (q as QuizQuestion).options.every(o => typeof o === "string") &&
      Number.isInteger((q as QuizQuestion).answerIndex) &&
      (q as QuizQuestion).answerIndex >= 0 &&
      (q as QuizQuestion).answerIndex < (q as QuizQuestion).options.length)
    .slice(0, 50);
}

/** Percentage score for submitted answers against a quiz. */
export function scoreQuiz(quiz: QuizQuestion[], answers: number[]) {
  if (!quiz.length) return 0;
  const correct = quiz.reduce((sum, q, i) => sum + (answers[i] === q.answerIndex ? 1 : 0), 0);
  return Math.round((correct / quiz.length) * 100);
}

/** Nairobi calendar date (YYYY-MM-DD) used as the once-per-day key for daily tasks. */
export function nairobiDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
