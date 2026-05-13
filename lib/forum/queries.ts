import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ForumAuthor,
  ForumCategory,
  ForumCategoryWithStats,
  ForumReply,
  ForumSearchHit,
  ForumTopicDetail,
  ForumTopicListItem,
} from "./types";

type RawTopicRow = {
  id: string;
  category_id: string;
  author_id: string;
  title: string;
  slug: string;
  body: string;
  tickers: string[] | null;
  pinned: boolean;
  locked: boolean;
  reply_count: number;
  vote_score: number;
  last_reply_at: string | null;
  last_reply_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type RawReplyRow = {
  id: string;
  topic_id: string;
  author_id: string;
  body: string;
  vote_score: number;
  created_at: string;
  updated_at: string;
};

type RawProfile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
};

async function fetchAuthors(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  ids: string[],
): Promise<Map<string, ForumAuthor>> {
  const map = new Map<string, ForumAuthor>();
  if (ids.length === 0) return map;
  const uniq = Array.from(new Set(ids));
  const { data } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url, role")
    .in("id", uniq);
  for (const r of (data ?? []) as RawProfile[]) {
    map.set(r.id, {
      id: r.id,
      username: r.username,
      full_name: r.full_name,
      avatar_url: r.avatar_url,
      role: r.role,
    });
  }
  return map;
}

export async function listCategories(): Promise<ForumCategory[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("forum_categories")
    .select("id, slug, name, description, icon, sort_order, active")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  return (data as ForumCategory[] | null) ?? [];
}

export async function listCategoriesWithStats(): Promise<ForumCategoryWithStats[]> {
  const supabase = await createSupabaseServerClient();
  const cats = await listCategories();
  if (cats.length === 0) return [];

  // 1 requete : compteur de topics par categorie + last_reply_at max
  const { data: rows } = await supabase
    .from("forum_topics")
    .select("category_id, last_reply_at, created_at")
    .is("deleted_at", null);

  const byCat = new Map<string, { count: number; last: string | null }>();
  for (const r of (rows ?? []) as {
    category_id: string;
    last_reply_at: string | null;
    created_at: string;
  }[]) {
    const cur = byCat.get(r.category_id) ?? { count: 0, last: null };
    cur.count += 1;
    const ts = r.last_reply_at ?? r.created_at;
    if (!cur.last || (ts && ts > cur.last)) cur.last = ts;
    byCat.set(r.category_id, cur);
  }

  return cats.map((c) => ({
    ...c,
    topic_count: byCat.get(c.id)?.count ?? 0,
    last_topic_at: byCat.get(c.id)?.last ?? null,
  }));
}

export async function countTopics(
  opts: {
    categoryId?: string;
    ticker?: string;
    authorId?: string;
  } = {},
): Promise<number> {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("forum_topics")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  if (opts.categoryId) q = q.eq("category_id", opts.categoryId);
  if (opts.ticker) q = q.contains("tickers", [opts.ticker.toUpperCase()]);
  if (opts.authorId) q = q.eq("author_id", opts.authorId);
  const { count } = await q;
  return count ?? 0;
}

export async function getCategoryBySlug(slug: string): Promise<ForumCategory | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("forum_categories")
    .select("id, slug, name, description, icon, sort_order, active")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  return (data as ForumCategory | null) ?? null;
}

type ListTopicsOpts = {
  categoryId?: string;
  ticker?: string;
  authorId?: string;
  limit?: number;
  offset?: number;
};

export async function listTopics(
  opts: ListTopicsOpts = {},
): Promise<ForumTopicListItem[]> {
  const supabase = await createSupabaseServerClient();
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  let q = supabase
    .from("forum_topics")
    .select(
      "id, category_id, author_id, title, slug, body, tickers, pinned, locked, reply_count, vote_score, last_reply_at, last_reply_user_id, created_at",
    )
    .is("deleted_at", null)
    .order("pinned", { ascending: false })
    .order("last_reply_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (opts.categoryId) q = q.eq("category_id", opts.categoryId);
  if (opts.ticker)
    q = q.contains("tickers", [opts.ticker.toUpperCase()]);
  if (opts.authorId) q = q.eq("author_id", opts.authorId);

  const { data: rowsRaw } = await q;
  const rows = (rowsRaw ?? []) as RawTopicRow[];

  if (rows.length === 0) return [];

  const cats = await listCategories();
  const catById = new Map(cats.map((c) => [c.id, c]));

  const authorIds = rows.flatMap((r) =>
    [r.author_id, r.last_reply_user_id].filter((s): s is string => !!s),
  );
  const authors = await fetchAuthors(supabase, authorIds);

  return rows.map((r) => {
    const cat = catById.get(r.category_id);
    return {
      id: r.id,
      category_id: r.category_id,
      category_slug: cat?.slug ?? "",
      category_name: cat?.name ?? "",
      author_id: r.author_id,
      author: authors.get(r.author_id) ?? null,
      title: r.title,
      slug: r.slug,
      tickers: r.tickers,
      pinned: r.pinned,
      locked: r.locked,
      reply_count: r.reply_count,
      vote_score: r.vote_score,
      last_reply_at: r.last_reply_at,
      last_reply_user: r.last_reply_user_id
        ? authors.get(r.last_reply_user_id) ?? null
        : null,
      created_at: r.created_at,
    };
  });
}

export async function getTopicWithReplies(topicId: string): Promise<{
  topic: ForumTopicDetail;
  replies: ForumReply[];
} | null> {
  const supabase = await createSupabaseServerClient();

  const { data: topicRaw } = await supabase
    .from("forum_topics")
    .select(
      "id, category_id, author_id, title, slug, body, tickers, pinned, locked, reply_count, vote_score, last_reply_at, last_reply_user_id, created_at, updated_at",
    )
    .eq("id", topicId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!topicRaw) return null;
  const t = topicRaw as RawTopicRow;

  const { data: repliesRaw } = await supabase
    .from("forum_replies")
    .select("id, topic_id, author_id, body, vote_score, created_at, updated_at")
    .eq("topic_id", topicId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(500);

  const replies = (repliesRaw ?? []) as RawReplyRow[];

  // Categorie
  const cats = await listCategories();
  const cat = cats.find((c) => c.id === t.category_id);

  // Auteurs (topic + reply + last_reply)
  const authorIds = [
    t.author_id,
    t.last_reply_user_id,
    ...replies.map((r) => r.author_id),
  ].filter((s): s is string => !!s);
  const authors = await fetchAuthors(supabase, authorIds);

  // Votes du user connecte (si auth) — pour pre-cocher l'upvote
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const topicVoteByUser = new Map<string, -1 | 0 | 1>();
  const replyVoteByUser = new Map<string, -1 | 0 | 1>();
  if (user) {
    const { data: tv } = await supabase
      .from("forum_topic_votes")
      .select("topic_id, value")
      .eq("user_id", user.id)
      .eq("topic_id", topicId);
    for (const r of (tv ?? []) as { topic_id: string; value: number }[]) {
      topicVoteByUser.set(r.topic_id, r.value === -1 ? -1 : 1);
    }
    if (replies.length > 0) {
      const { data: rv } = await supabase
        .from("forum_reply_votes")
        .select("reply_id, value")
        .eq("user_id", user.id)
        .in(
          "reply_id",
          replies.map((r) => r.id),
        );
      for (const r of (rv ?? []) as { reply_id: string; value: number }[]) {
        replyVoteByUser.set(r.reply_id, r.value === -1 ? -1 : 1);
      }
    }
  }

  return {
    topic: {
      id: t.id,
      category_id: t.category_id,
      category_slug: cat?.slug ?? "",
      category_name: cat?.name ?? "",
      author_id: t.author_id,
      author: authors.get(t.author_id) ?? null,
      title: t.title,
      slug: t.slug,
      tickers: t.tickers,
      body: t.body,
      pinned: t.pinned,
      locked: t.locked,
      reply_count: t.reply_count,
      vote_score: t.vote_score,
      last_reply_at: t.last_reply_at,
      last_reply_user: t.last_reply_user_id
        ? authors.get(t.last_reply_user_id) ?? null
        : null,
      created_at: t.created_at,
      updated_at: t.updated_at,
      user_vote: topicVoteByUser.get(t.id) ?? 0,
    },
    replies: replies.map((r) => ({
      id: r.id,
      topic_id: r.topic_id,
      author_id: r.author_id,
      author: authors.get(r.author_id) ?? null,
      body: r.body,
      vote_score: r.vote_score,
      user_vote: replyVoteByUser.get(r.id) ?? 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
  };
}

export async function searchForum(q: string, limit = 30): Promise<ForumSearchHit[]> {
  if (!q.trim()) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("forum_search", {
    p_query: q.trim(),
    p_limit: limit,
  });
  return (data as ForumSearchHit[] | null) ?? [];
}

export type UserReplyItem = {
  reply_id: string;
  topic_id: string;
  topic_title: string;
  category_slug: string;
  body_preview: string;
  vote_score: number;
  created_at: string;
};

export async function listUserReplies(
  userId: string,
  limit = 10,
): Promise<UserReplyItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data: rawReplies } = await supabase
    .from("forum_replies")
    .select("id, topic_id, body, vote_score, created_at")
    .eq("author_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  const replies = (rawReplies ?? []) as {
    id: string;
    topic_id: string;
    body: string;
    vote_score: number;
    created_at: string;
  }[];
  if (replies.length === 0) return [];

  const topicIds = Array.from(new Set(replies.map((r) => r.topic_id)));
  const { data: topicsRaw } = await supabase
    .from("forum_topics")
    .select("id, title, category_id")
    .in("id", topicIds);
  const topicsById = new Map<string, { title: string; category_id: string }>();
  for (const t of (topicsRaw ?? []) as {
    id: string;
    title: string;
    category_id: string;
  }[]) {
    topicsById.set(t.id, { title: t.title, category_id: t.category_id });
  }

  const cats = await listCategories();
  const catById = new Map(cats.map((c) => [c.id, c.slug]));

  return replies.map((r) => {
    const topic = topicsById.get(r.topic_id);
    return {
      reply_id: r.id,
      topic_id: r.topic_id,
      topic_title: topic?.title ?? "Discussion supprimée",
      category_slug: topic ? catById.get(topic.category_id) ?? "" : "",
      body_preview: r.body.slice(0, 200),
      vote_score: r.vote_score,
      created_at: r.created_at,
    };
  });
}

export async function getForumUnreadCount(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;
  const { data } = await supabase.rpc("forum_unread_count");
  return typeof data === "number" ? data : 0;
}
