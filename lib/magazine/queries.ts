import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Article, Author, Issue } from "@/lib/magazine";
import type {
  ArticleRow,
  AuthorRow,
  IssueRow,
  NewsletterStatus,
  NewsletterSubscriberRow,
} from "./types";

// =============================================================================
// MAPPERS
// =============================================================================

function rowToAuthor(r: AuthorRow): Author {
  return {
    id: r.id,
    slug: r.slug,
    userId: r.user_id,
    name: r.display_name,
    title: r.title,
    bio: r.bio,
    initials: r.initials,
  };
}

function rowToIssue(r: IssueRow): Issue {
  return {
    id: r.id,
    slug: r.slug,
    number: r.number,
    monthLabel: r.month_label,
    publishedAt: r.published_at,
    theme: r.theme,
    blurb: r.blurb,
    editorial: r.editorial,
    editorId: r.editor_id,
    coverGradient: { from: r.cover_gradient_from, to: r.cover_gradient_to },
    coverText: r.cover_text,
    updatedAt: r.updated_at,
  };
}

type ArticleWithJoins = ArticleRow & {
  magazine_issues: { slug: string } | null;
  magazine_authors: { slug: string; display_name: string; initials: string } | null;
};

function rowToArticle(r: ArticleWithJoins): Article {
  return {
    id: r.id,
    slug: r.slug,
    issueId: r.issue_id,
    issueSlug: r.magazine_issues?.slug ?? "",
    category: r.category,
    title: r.title,
    dek: r.dek,
    excerpt: r.excerpt,
    tags: r.tags ?? [],
    authorId: r.author_id,
    authorSlug: r.magazine_authors?.slug ?? null,
    authorName: r.magazine_authors?.display_name ?? null,
    authorInitials: r.magazine_authors?.initials ?? null,
    publishedAt: r.published_at,
    readingTimeMinutes: r.reading_time_minutes,
    accent: r.accent,
    body: Array.isArray(r.body) ? r.body : [],
    featured: r.featured,
    updatedAt: r.updated_at,
  };
}

// =============================================================================
// PUBLIC : ISSUES
// =============================================================================

export async function listPublishedIssues(): Promise<Issue[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("magazine_issues")
    .select("*")
    .not("published_at", "is", null)
    .order("number", { ascending: false });
  return ((data as IssueRow[] | null) ?? []).map(rowToIssue);
}

export async function getPublishedIssueBySlug(slug: string): Promise<Issue | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("magazine_issues")
    .select("*")
    .eq("slug", slug)
    .not("published_at", "is", null)
    .maybeSingle();
  return data ? rowToIssue(data as IssueRow) : null;
}

// =============================================================================
// PUBLIC : ARTICLES
// =============================================================================

const ARTICLE_SELECT = `
  *,
  magazine_issues!inner(slug),
  magazine_authors(slug, display_name, initials)
`;

export async function listPublishedArticles(): Promise<Article[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("magazine_articles")
    .select(ARTICLE_SELECT)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false });
  return ((data as ArticleWithJoins[] | null) ?? []).map(rowToArticle);
}

export async function getPublishedArticleBySlug(slug: string): Promise<Article | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("magazine_articles")
    .select(ARTICLE_SELECT)
    .eq("slug", slug)
    .not("published_at", "is", null)
    .maybeSingle();
  return data ? rowToArticle(data as ArticleWithJoins) : null;
}

export async function getArticlesByIssueId(issueId: string): Promise<Article[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("magazine_articles")
    .select(ARTICLE_SELECT)
    .eq("issue_id", issueId)
    .not("published_at", "is", null)
    .order("published_at", { ascending: true });
  return ((data as ArticleWithJoins[] | null) ?? []).map(rowToArticle);
}

export async function getRelatedArticles(
  article: Article,
  limit = 3,
): Promise<Article[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("magazine_articles")
    .select(ARTICLE_SELECT)
    .neq("id", article.id)
    .or(`category.eq.${article.category},issue_id.eq.${article.issueId}`)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(20);
  const all = ((data as ArticleWithJoins[] | null) ?? []).map(rowToArticle);
  return [...all]
    .sort((a, b) => {
      const sameIssueA = a.issueId === article.issueId ? 1 : 0;
      const sameIssueB = b.issueId === article.issueId ? 1 : 0;
      if (sameIssueA !== sameIssueB) return sameIssueB - sameIssueA;
      return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
    })
    .slice(0, limit);
}

// =============================================================================
// PUBLIC : AUTHORS
// =============================================================================

export async function listAuthors(): Promise<Author[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("magazine_authors")
    .select("*")
    .order("display_name", { ascending: true });
  return ((data as AuthorRow[] | null) ?? []).map(rowToAuthor);
}

export async function getAuthorById(id: string): Promise<Author | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("magazine_authors")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ? rowToAuthor(data as AuthorRow) : null;
}

// =============================================================================
// ADMIN
// =============================================================================

export async function listAllIssues(opts: {
  search?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<Issue[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("admin_list_magazine_issues", {
    p_search: opts.search ?? null,
    p_limit: opts.limit ?? 100,
    p_offset: opts.offset ?? 0,
  });
  return ((data as IssueRow[] | null) ?? []).map(rowToIssue);
}

export async function listAllArticles(opts: {
  issueId?: string;
  search?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<Article[]> {
  // On utilise un select direct (avec joins) plutot que la RPC
  // car la RPC ne peut pas ramener les joins.
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("magazine_articles")
    .select(ARTICLE_SELECT)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.issueId) q = q.eq("issue_id", opts.issueId);
  if (opts.search && opts.search.trim()) {
    const s = `%${opts.search.trim()}%`;
    q = q.or(`title.ilike.${s},slug.ilike.${s}`);
  }
  const { data } = await q;
  return ((data as ArticleWithJoins[] | null) ?? []).map(rowToArticle);
}

export async function getIssueById(id: string): Promise<Issue | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("magazine_issues")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ? rowToIssue(data as IssueRow) : null;
}

export async function getArticleById(id: string): Promise<Article | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("magazine_articles")
    .select(ARTICLE_SELECT)
    .eq("id", id)
    .maybeSingle();
  return data ? rowToArticle(data as ArticleWithJoins) : null;
}

export async function listNewsletterSubscribers(opts: {
  status?: NewsletterStatus;
  search?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<NewsletterSubscriberRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("admin_list_newsletter", {
    p_status: opts.status ?? null,
    p_search: opts.search ?? null,
    p_limit: opts.limit ?? 500,
    p_offset: opts.offset ?? 0,
  });
  return (data as NewsletterSubscriberRow[] | null) ?? [];
}

export async function getMagazineCounts(): Promise<{
  issues: number;
  articles: number;
  authors: number;
  totalReadingMinutes: number;
  subscribers: number;
}> {
  const supabase = await createSupabaseServerClient();
  const [issues, articles, authors, subs] = await Promise.all([
    supabase
      .from("magazine_issues")
      .select("id", { count: "exact", head: true })
      .not("published_at", "is", null),
    supabase
      .from("magazine_articles")
      .select("reading_time_minutes")
      .not("published_at", "is", null),
    supabase
      .from("magazine_authors")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("newsletter_subscribers")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
  ]);
  const articlesData =
    (articles.data as { reading_time_minutes: number }[] | null) ?? [];
  return {
    issues: issues.count ?? 0,
    articles: articlesData.length,
    authors: authors.count ?? 0,
    totalReadingMinutes: articlesData.reduce(
      (s, a) => s + (a.reading_time_minutes ?? 0),
      0,
    ),
    subscribers: subs.count ?? 0,
  };
}
