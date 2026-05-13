export type ForumCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  active: boolean;
};

export type ForumCategoryWithStats = ForumCategory & {
  topic_count: number;
  last_topic_at: string | null;
};

export type ForumAuthor = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
};

export type ForumTopicListItem = {
  id: string;
  category_id: string;
  category_slug: string;
  category_name: string;
  author_id: string;
  author: ForumAuthor | null;
  title: string;
  slug: string;
  tickers: string[] | null;
  pinned: boolean;
  locked: boolean;
  reply_count: number;
  vote_score: number;
  last_reply_at: string | null;
  last_reply_user: ForumAuthor | null;
  created_at: string;
};

export type ForumTopicDetail = ForumTopicListItem & {
  body: string;
  /** Vote courant de l'utilisateur sur ce topic : -1, 0 (pas vote), ou 1 */
  user_vote: -1 | 0 | 1;
  updated_at: string;
};

export type ForumReply = {
  id: string;
  topic_id: string;
  author_id: string;
  author: ForumAuthor | null;
  body: string;
  vote_score: number;
  user_vote: -1 | 0 | 1;
  created_at: string;
  updated_at: string;
};

export type ForumSearchHit = {
  topic_id: string;
  category_slug: string;
  title: string;
  slug: string;
  snippet: string;
  rank: number;
};

export const REPORT_CATEGORIES = [
  { code: "spam", label: "Spam ou publicité" },
  { code: "harcelement", label: "Harcèlement" },
  { code: "insulte", label: "Insulte" },
  { code: "arnaque", label: "Arnaque" },
  { code: "autre", label: "Autre" },
] as const;

export type ForumReportCategoryCode = (typeof REPORT_CATEGORIES)[number]["code"];
