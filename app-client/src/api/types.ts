export type UserOut = {
  id: string;
  nickname: string;
  daily_goal_minutes: number;
  pending_goal_minutes: number | null;
  streak_count: number;
  credit_balance: number;
};

export type SessionOut = {
  id: string;
  started_at: string;
  ended_at: string | null;
  counted_minutes: number;
  status: "open" | "closed" | "abandoned";
};

export type JudgeResultOut = {
  result: "pass" | "fail";
  photo_id: string;
  reason: string;
  session: SessionOut | null;
};

export type ChallengeOut = {
  id: string;
  product_id: string;
  entry_amount: number;
  daily_payback: number;
  completion_bonus: number;
  total_days: number;
  started_on: string;
  ends_on: string;
  paid_with: "iap" | "credit";
  status: "active" | "completed" | "refunded";
};

export type ChallengeProductOut = {
  product_id: string;
  days: number;
  daily_payback: number;
  price: number;
  completion_bonus: number;
};

export type GroupOut = { id: string; name: string; invite_code: string };

export type FeedPhotoOut = {
  kind: "start" | "end";
  url: string;
  received_at: string;
};

export type FeedItemOut = {
  user_id: string;
  nickname: string;
  streak_count: number;
  total_minutes: number;
  goal_minutes: number;
  result: "success" | "passed" | "failed" | null;
  photos: FeedPhotoOut[];
};

export type DailyRecordOut = {
  id: string;
  date: string;
  total_minutes: number;
  goal_minutes: number;
  result: "success" | "passed" | "failed";
  payback_amount: number;
  streak_snapshot: number;
  settled_at: string;
};

export type LoginOut = { access_token: string; user: UserOut };
