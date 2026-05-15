"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  acceptConversation,
  declineConversation,
  hideConversation,
  markConversationRead,
  sendMessage,
  startAdminConversation,
  startConversation,
} from "@/lib/messagerie/actions";
import {
  ADMIN_TEAM_PROFILE,
  type ConversationSummary,
  type Message,
  type Profile,
} from "@/lib/messagerie/types";
import Avatar from "./Avatar";
import ReportMessageModal from "./ReportMessageModal";
import { displayName, fmtTimeFull, fmtTimeShort } from "./format";

type Props = {
  currentUserId: string;
  currentUserRole: string | null;
  conversations: ConversationSummary[];
  initialActiveId: string | null;
  initialMessages: Message[];
  initialOther: Profile | null;
};

const INITIATOR_ROLES = [
  "premium",
  "pro",
  "adminlevel1",
  "adminlevel2",
  "adminlevel3",
];

export default function MessagerieApp({
  currentUserId,
  currentUserRole,
  conversations: initialConversations,
  initialActiveId,
  initialMessages,
  initialOther,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // Comptes autorisés à INITIER une conversation avec un membre.
  const canInitiate = !!currentUserRole && INITIATOR_ROLES.includes(currentUserRole);

  const [conversations, setConversations] = useState<ConversationSummary[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(initialActiveId);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState<string>("");
  const [isSending, startSend] = useTransition();
  const [sendError, setSendError] = useState<string | null>(null);

  // Vue mobile : on affiche soit la liste, soit le fil (jamais les deux).
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");
  // id de la demande en cours d'acceptation / refus
  const [requestBusy, setRequestBusy] = useState<string | null>(null);
  // « Supprimer pour moi » : id de la conversation en attente de confirmation.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Signalement
  const [reportTarget, setReportTarget] = useState<Message | null>(null);
  const [reportFlash, setReportFlash] = useState<string | null>(null);

  // Search state pour demarrer une nouvelle conversation
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Conversation active + interlocuteur, derives de la liste.
  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );
  const otherProfile = activeConv?.other ?? initialOther ?? null;

  // Une demande RECUE = conversation 'pending' dont je ne suis pas l'initiateur.
  const isRequestIncoming = useCallback(
    (c: ConversationSummary) =>
      c.status === "pending" && c.created_by !== currentUserId,
    [currentUserId],
  );
  const requests = useMemo(
    () => conversations.filter(isRequestIncoming),
    [conversations, isRequestIncoming],
  );
  const threads = useMemo(
    () => conversations.filter((c) => !isRequestIncoming(c)),
    [conversations, isRequestIncoming],
  );

  const activeIsRequestIncoming = !!activeConv && isRequestIncoming(activeConv);
  const activeIsRequestOutgoing =
    !!activeConv &&
    activeConv.status === "pending" &&
    activeConv.created_by === currentUserId;

  // Scroll to bottom quand les messages changent
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeId]);

  // Realtime : abonner aux nouveaux messages de la conversation active.
  // Nom unique par mount pour eviter le conflit StrictMode (double useEffect).
  useEffect(() => {
    if (!activeId) return;
    const channelName = `messages:${activeId}:${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => {
            // Deja present par id reel : skip (cas ou le server a repondu avant le realtime)
            if (prev.some((m) => m.id === msg.id)) return prev;
            // Mon propre message : il y a probablement un placeholder optimiste tmp-XXX
            // avec le meme body — on le remplace au lieu d'ajouter un doublon.
            if (msg.sender_id === currentUserId) {
              const tmpIdx = prev.findIndex(
                (m) => m.id.startsWith("tmp-") && m.body === msg.body,
              );
              if (tmpIdx >= 0) {
                const next = prev.slice();
                next[tmpIdx] = msg;
                return next;
              }
            }
            return [...prev, msg];
          });
          // Si le message vient de l'autre, marquer comme lu
          if (msg.sender_id !== currentUserId) {
            void markConversationRead(activeId);
          }
          // Mettre a jour la sidebar
          setConversations((prev) =>
            prev
              .map((c) =>
                c.id === activeId
                  ? {
                      ...c,
                      last_message_at: msg.created_at,
                      lastMessage: {
                        body: msg.body,
                        sender_id: msg.sender_id,
                        created_at: msg.created_at,
                      },
                      unreadCount:
                        msg.sender_id === currentUserId ? c.unreadCount : 0,
                    }
                  : c,
              )
              .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeId, supabase, currentUserId]);

  // Realtime : abonner a TOUTES les conversations pour mettre a jour la sidebar
  // quand un message arrive dans une autre conversation.
  useEffect(() => {
    const convIds = conversations.map((c) => c.id);
    if (convIds.length === 0) return;

    const sidebarChannelName = `messages:sidebar:${currentUserId}:${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(sidebarChannelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const msg = payload.new as Message;
          if (!convIds.includes(msg.conversation_id)) return;
          // Ignorer si c'est la conv active (deja gere)
          if (msg.conversation_id === activeId) return;
          setConversations((prev) =>
            prev
              .map((c) =>
                c.id === msg.conversation_id
                  ? {
                      ...c,
                      last_message_at: msg.created_at,
                      lastMessage: {
                        body: msg.body,
                        sender_id: msg.sender_id,
                        created_at: msg.created_at,
                      },
                      unreadCount:
                        msg.sender_id === currentUserId
                          ? c.unreadCount
                          : c.unreadCount + 1,
                    }
                  : c,
              )
              .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // On re-subscribe quand la liste des conversations change.
  }, [conversations.length, activeId, supabase, currentUserId, conversations]);

  // Charger les messages quand on selectionne une conversation
  const selectConversation = useCallback(
    async (conv: ConversationSummary) => {
      setActiveId(conv.id);
      setMessages([]);
      setDraft("");
      setSendError(null);
      setSearchOpen(false);
      setMobileView("thread");
      setPendingDeleteId(null);

      // Marquer comme lue
      void markConversationRead(conv.id);
      setConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c)),
      );

      // Charger les messages directement (pas via server action pour eviter un round-trip).
      // On respecte le masquage « supprimer pour moi » : seuls les messages
      // postérieurs au clearedAt de l'utilisateur sont chargés.
      let query = supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conv.id);
      if (conv.clearedAt) {
        query = query.gt("created_at", conv.clearedAt);
      }
      const { data } = await query
        .order("created_at", { ascending: true })
        .limit(200);
      if (data) setMessages(data as Message[]);

      // Focus sur l'input
      setTimeout(() => inputRef.current?.focus(), 100);
    },
    [supabase],
  );

  // Recherche d'utilisateurs (debouncee) — reservee aux comptes pouvant initier.
  useEffect(() => {
    if (!searchOpen || !canInitiate || !searchQuery.trim()) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase.rpc("search_users", {
        p_query: searchQuery.trim(),
        p_limit: 10,
      });
      setSearchResults((data as Profile[]) ?? []);
      setSearching(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOpen, supabase, canInitiate]);

  function toggleSearch() {
    setSearchOpen((open) => !open);
    setSearchQuery("");
    setSearchResults([]);
    setSendError(null);
  }

  async function startWith(profile: Profile) {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setSendError(null);

    const result = await startConversation(profile.id);
    if (!result.ok) {
      setSendError(result.error);
      return;
    }
    const convId = result.data.conversationId;

    // Si la conv existe deja dans la sidebar, on la selectionne
    const existing = conversations.find((c) => c.id === convId);
    if (existing) {
      void selectConversation(existing);
    } else {
      // Sinon on l'ajoute en tete et on la selectionne. Nouvelle conv directe
      // initiee par moi => 'pending' (demande de message).
      const newConv: ConversationSummary = {
        id: convId,
        last_message_at: new Date().toISOString(),
        other: profile,
        lastMessage: null,
        unreadCount: 0,
        status: "pending",
        kind: "direct",
        created_by: currentUserId,
        clearedAt: null,
      };
      setConversations((prev) => [newConv, ...prev]);
      void selectConversation(newConv);
    }
    // Refresh server data en arriere-plan
    router.refresh();
  }

  // Ouvre (ou retrouve) le canal de contact avec l'equipe AzimutFinance.
  async function contactAdminTeam() {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setSendError(null);

    const result = await startAdminConversation();
    if (!result.ok) {
      setSendError(result.error);
      return;
    }
    const convId = result.data.conversationId;
    const existing = conversations.find((c) => c.id === convId);
    if (existing) {
      void selectConversation(existing);
    } else {
      const newConv: ConversationSummary = {
        id: convId,
        last_message_at: new Date().toISOString(),
        other: ADMIN_TEAM_PROFILE,
        lastMessage: null,
        unreadCount: 0,
        status: "accepted",
        kind: "admin",
        created_by: currentUserId,
        clearedAt: null,
      };
      setConversations((prev) => [newConv, ...prev]);
      void selectConversation(newConv);
    }
    router.refresh();
  }

  async function handleAccept(convId: string) {
    setRequestBusy(convId);
    setSendError(null);
    const result = await acceptConversation(convId);
    setRequestBusy(null);
    if (!result.ok) {
      setSendError(result.error);
      return;
    }
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, status: "accepted" } : c)),
    );
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function handleDecline(convId: string) {
    setRequestBusy(convId);
    setSendError(null);
    const result = await declineConversation(convId);
    setRequestBusy(null);
    if (!result.ok) {
      setSendError(result.error);
      return;
    }
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (activeId === convId) {
      setActiveId(null);
      setMessages([]);
      setMobileView("list");
    }
  }

  // « Supprimer pour moi » : masque la conversation de ma liste.
  async function handleHide(convId: string) {
    setDeleteBusy(true);
    setSendError(null);
    const result = await hideConversation(convId);
    setDeleteBusy(false);
    setPendingDeleteId(null);
    if (!result.ok) {
      setSendError(result.error);
      return;
    }
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (activeId === convId) {
      setActiveId(null);
      setMessages([]);
      setMobileView("list");
    }
    router.refresh();
  }

  function handleSend() {
    if (!activeId) return;
    const body = draft.trim();
    if (!body) return;
    setSendError(null);

    // Insertion optimiste
    const tempId = `tmp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conversation_id: activeId,
      sender_id: currentUserId,
      body,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");

    startSend(async () => {
      const result = await sendMessage({ conversationId: activeId, body });
      if (!result.ok) {
        setSendError(result.error);
        // Rollback
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return;
      }
      // Remplace le tmp par le vrai message
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? result.data : m)),
      );
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Rendu d'une ligne de conversation dans la sidebar.
  function renderConvRow(c: ConversationSummary) {
    const isActive = c.id === activeId;
    const isMe = c.lastMessage?.sender_id === currentUserId;
    const isAdminChannel = c.kind === "admin";
    const isOutgoingRequest =
      c.status === "pending" && c.created_by === currentUserId;
    return (
      <li key={c.id}>
        <button
          onClick={() => selectConversation(c)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition ${
            isActive
              ? "bg-blue-50/70 border-l-2 border-blue-600"
              : "hover:bg-slate-100"
          }`}
        >
          <Avatar profile={c.other} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-slate-900 truncate">
                {displayName(c.other)}
              </span>
              <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                {fmtTimeShort(c.last_message_at)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-slate-500 truncate flex-1">
                {c.lastMessage
                  ? `${isMe ? "Vous : " : ""}${c.lastMessage.body}`
                  : "Pas encore de message"}
              </span>
              {isAdminChannel && (
                <span className="bg-slate-200 text-slate-600 text-[9px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0">
                  Équipe
                </span>
              )}
              {isOutgoingRequest && (
                <span className="bg-amber-100 text-amber-700 text-[9px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0">
                  En attente
                </span>
              )}
              {c.unreadCount > 0 && !isActive && (
                <span className="bg-blue-600 text-white text-[10px] font-semibold rounded-full px-1.5 py-0.5 min-w-[18px] text-center shrink-0">
                  {c.unreadCount}
                </span>
              )}
            </div>
          </div>
        </button>
      </li>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden flex h-[calc(100vh-180px)] min-h-[480px]">
      {/* Sidebar : liste des conversations.
          Mobile : visible uniquement en vue "list". */}
      <aside
        className={`${
          mobileView === "thread" ? "hidden md:flex" : "flex"
        } w-full md:w-80 border-r border-slate-200 flex-col bg-slate-50/40`}
      >
        <div className="p-3 border-b border-slate-200">
          <button
            onClick={toggleSearch}
            className="w-full text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium py-2 rounded transition flex items-center justify-center gap-2"
          >
            {searchOpen ? "Fermer la recherche" : "+ Nouveau message"}
          </button>
        </div>

        {searchOpen ? (
          <div className="flex-1 overflow-y-auto">
            {/* Contact équipe : accessible à TOUS les comptes. */}
            <button
              onClick={contactAdminTeam}
              className="w-full flex items-center gap-3 px-3 py-3 border-b border-slate-200 bg-blue-50/60 hover:bg-blue-50 text-left"
            >
              <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-semibold shrink-0">
                AF
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900">
                  Contacter l&apos;équipe AzimutFinance
                </div>
                <div className="text-[11px] text-slate-500">
                  Question, signalement, aide — tous les admins reçoivent le
                  message.
                </div>
              </div>
            </button>

            {canInitiate ? (
              <>
                <div className="p-3 border-b border-slate-200 bg-white space-y-2">
                  <label className="block text-[11px] font-medium text-slate-600">
                    Pseudo exact du membre
                  </label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ex. : jean_invest"
                    autoFocus
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-slate-500"
                  />
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-2 leading-relaxed">
                    ⚠️ Tout abus (démarchage, spam, insultes, harcèlement) peut
                    entraîner la suspension ou le bannissement de votre compte,
                    y compris Premium. Vous êtes limité à 5 nouvelles
                    conversations par 24 h.
                  </p>
                </div>
                <div className="divide-y divide-slate-100">
                  {!searchQuery.trim() ? (
                    <div className="text-xs text-slate-400 px-4 py-6 text-center">
                      Entrez le <span className="font-medium">pseudo exact</span>{" "}
                      du membre à contacter (la recherche par fragment de nom
                      est désactivée). Votre premier message lui sera envoyé
                      comme une demande, qu&apos;il devra accepter pour vous
                      répondre.
                    </div>
                  ) : searching ? (
                    <div className="text-xs text-slate-400 px-4 py-6 text-center">
                      Recherche…
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="text-xs text-slate-400 px-4 py-6 text-center">
                      Aucun membre avec le pseudo «&nbsp;{searchQuery.trim()}&nbsp;».
                      Vérifiez l&apos;orthographe exacte.
                    </div>
                  ) : (
                    searchResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => startWith(p)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 text-left"
                      >
                        <Avatar profile={p} size={32} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-900 truncate">
                            {displayName(p)}
                          </div>
                          {p.username && (
                            <div className="text-[11px] text-slate-500 truncate">
                              @{p.username}
                            </div>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="p-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">
                    Écrire à un membre — réservé Premium
                  </div>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Démarrer une conversation avec un autre membre est réservé
                    aux comptes Premium et Pro. Vous pouvez en revanche répondre
                    aux conversations que vous recevez, et contacter
                    l&apos;équipe AzimutFinance à tout moment.
                  </p>
                  <Link
                    href="/premium"
                    className="inline-block mt-3 text-xs bg-slate-900 hover:bg-slate-700 text-white font-medium px-3 py-1.5 rounded transition"
                  >
                    Découvrir Premium
                  </Link>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="text-xs text-slate-500 px-4 py-8 text-center">
                Pas encore de conversation.
                <br />
                Cliquez sur <span className="font-medium">+ Nouveau message</span>{" "}
                pour démarrer ou contacter l&apos;équipe.
              </div>
            ) : (
              <>
                {/* Demandes de message reçues */}
                {requests.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide font-semibold text-amber-700 bg-amber-50 border-b border-amber-100">
                      Demandes ({requests.length})
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {requests.map(renderConvRow)}
                    </ul>
                  </div>
                )}
                {/* Conversations */}
                {threads.length > 0 && (
                  <div>
                    {requests.length > 0 && (
                      <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide font-semibold text-slate-500 bg-slate-100/70 border-b border-slate-200">
                        Conversations
                      </div>
                    )}
                    <ul className="divide-y divide-slate-100">
                      {threads.map(renderConvRow)}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </aside>

      {/* Main : thread.
          Mobile : visible uniquement en vue "thread". */}
      <section
        className={`${
          mobileView === "list" ? "hidden md:flex" : "flex"
        } flex-1 flex-col min-w-0`}
      >
        {!activeId || !otherProfile ? (
          <div className="flex-1 flex items-center justify-center text-center px-6">
            <div>
              <div className="text-6xl mb-3 opacity-20">💬</div>
              <h2 className="text-base font-semibold text-slate-900">
                Sélectionne une conversation
              </h2>
              <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto">
                Choisis un échange dans la liste, ou démarre une nouvelle
                conversation via <span className="font-medium">+ Nouveau message</span>.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-3 md:px-5 py-3 border-b border-slate-200 flex items-center gap-2 md:gap-3 bg-white">
              <button
                onClick={() => setMobileView("list")}
                className="md:hidden -ml-1 p-1 text-slate-500 hover:text-slate-900"
                aria-label="Retour à la liste"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <Avatar profile={otherProfile} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 truncate">
                    {displayName(otherProfile)}
                  </span>
                  {activeConv?.kind === "admin" && (
                    <span className="bg-slate-200 text-slate-600 text-[9px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0">
                      Support
                    </span>
                  )}
                </div>
                {otherProfile.username && (
                  <div className="text-[11px] text-slate-500">@{otherProfile.username}</div>
                )}
              </div>
              {/* Supprimer pour moi — pas pour une demande reçue (utiliser Refuser). */}
              {!activeIsRequestIncoming && (
                <button
                  onClick={() => setPendingDeleteId(activeId)}
                  className="shrink-0 p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                  title="Supprimer cette conversation"
                  aria-label="Supprimer cette conversation"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6" />
                  </svg>
                </button>
              )}
            </div>

            {/* Confirmation « supprimer pour moi » */}
            {pendingDeleteId === activeId && (
              <div className="px-4 md:px-5 py-3 border-b border-rose-200 bg-rose-50">
                <p className="text-sm text-slate-700 leading-relaxed">
                  Supprimer cette conversation de votre liste ? Les messages
                  actuels ne vous seront plus affichés. Elle réapparaîtra si{" "}
                  <span className="font-semibold">{displayName(otherProfile)}</span>{" "}
                  vous écrit à nouveau.
                </p>
                <div className="flex gap-2 mt-2.5">
                  <button
                    onClick={() => handleHide(activeId)}
                    disabled={deleteBusy}
                    className="text-sm bg-rose-600 hover:bg-rose-700 text-white font-medium px-4 py-1.5 rounded-lg transition disabled:opacity-60"
                  >
                    {deleteBusy ? "…" : "Supprimer"}
                  </button>
                  <button
                    onClick={() => setPendingDeleteId(null)}
                    disabled={deleteBusy}
                    className="text-sm bg-white hover:bg-slate-50 text-slate-700 font-medium px-4 py-1.5 rounded-lg border border-slate-300 transition disabled:opacity-60"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {/* Messages list */}
            <div className="flex-1 overflow-y-auto px-4 md:px-5 py-4 space-y-1 bg-slate-50/30">
              {messages.length === 0 ? (
                <div className="text-xs text-slate-400 text-center py-8">
                  Aucun message encore. Lance la conversation !
                </div>
              ) : (
                messages.map((m, idx) => {
                  const isMine = m.sender_id === currentUserId;
                  const prev = messages[idx - 1];
                  const showTime =
                    !prev ||
                    new Date(m.created_at).getTime() -
                      new Date(prev.created_at).getTime() >
                      5 * 60 * 1000;
                  return (
                    <div key={m.id}>
                      {showTime && (
                        <div className="text-[10px] text-slate-400 text-center my-3 tabular-nums">
                          {fmtTimeFull(m.created_at)}
                        </div>
                      )}
                      <div
                        className={`group flex items-center gap-1.5 ${
                          isMine ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[80%] md:max-w-[75%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                            isMine
                              ? "bg-blue-600 text-white rounded-br-sm order-2"
                              : "bg-white text-slate-900 border border-slate-200 rounded-bl-sm"
                          }`}
                        >
                          {m.body}
                        </div>
                        {!isMine && !m.id.startsWith("tmp-") && (
                          <button
                            type="button"
                            onClick={() => setReportTarget(m)}
                            title="Signaler ce message"
                            aria-label="Signaler ce message"
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-400 hover:text-rose-600 text-base px-1 transition-opacity"
                          >
                            ⚑
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Zone du bas : banniere de demande OU champ de saisie */}
            {activeIsRequestIncoming ? (
              <div className="border-t border-slate-200 p-4 bg-amber-50/70">
                <p className="text-sm text-slate-700 mb-3 leading-relaxed">
                  <span className="font-semibold">{displayName(otherProfile)}</span>{" "}
                  souhaite démarrer une conversation avec vous. Acceptez pour
                  pouvoir répondre, ou refusez pour la supprimer.
                </p>
                {sendError && (
                  <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-1.5 mb-2">
                    {sendError}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAccept(activeId)}
                    disabled={requestBusy === activeId}
                    className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 rounded-lg transition disabled:opacity-60"
                  >
                    {requestBusy === activeId ? "…" : "Accepter"}
                  </button>
                  <button
                    onClick={() => handleDecline(activeId)}
                    disabled={requestBusy === activeId}
                    className="text-sm bg-white hover:bg-slate-50 text-slate-700 font-medium px-4 py-2 rounded-lg border border-slate-300 transition disabled:opacity-60"
                  >
                    Refuser
                  </button>
                </div>
              </div>
            ) : (
              <div className="border-t border-slate-200 p-3 bg-white">
                {activeIsRequestOutgoing && (
                  <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 mb-2">
                    Demande envoyée — {displayName(otherProfile)} pourra vous
                    répondre après avoir accepté votre message.
                  </div>
                )}
                {sendError && (
                  <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-1.5 mb-2">
                    {sendError}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Écrire un message…  (Entrée pour envoyer · Maj+Entrée pour aller à la ligne)"
                    rows={1}
                    className="flex-1 resize-none text-sm border border-slate-300 rounded-lg px-3 py-2 max-h-32 focus:outline-none focus:border-slate-500"
                    style={{ minHeight: 38 }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={isSending || !draft.trim()}
                    className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed h-[38px]"
                  >
                    {isSending ? "…" : "Envoyer"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {reportTarget && (
        <ReportMessageModal
          messageId={reportTarget.id}
          bodyPreview={reportTarget.body}
          onClose={() => setReportTarget(null)}
          onSuccess={() => {
            setReportTarget(null);
            setReportFlash("Signalement envoyé. Merci, un modérateur va l'examiner.");
            setTimeout(() => setReportFlash(null), 4000);
          }}
        />
      )}

      {reportFlash && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg"
        >
          {reportFlash}
        </div>
      )}
    </div>
  );
}
