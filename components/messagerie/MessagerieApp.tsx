"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  markConversationRead,
  sendMessage,
  startConversation,
} from "@/lib/messagerie/actions";
import type {
  ConversationSummary,
  Message,
  Profile,
} from "@/lib/messagerie/types";
import Avatar from "./Avatar";
import { displayName, fmtTimeFull, fmtTimeShort } from "./format";

type Props = {
  currentUserId: string;
  conversations: ConversationSummary[];
  initialActiveId: string | null;
  initialMessages: Message[];
  initialOther: Profile | null;
};

export default function MessagerieApp({
  currentUserId,
  conversations: initialConversations,
  initialActiveId,
  initialMessages,
  initialOther,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [conversations, setConversations] = useState<ConversationSummary[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(initialActiveId);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [otherProfile, setOtherProfile] = useState<Profile | null>(initialOther);
  const [draft, setDraft] = useState<string>("");
  const [isSending, startSend] = useTransition();
  const [sendError, setSendError] = useState<string | null>(null);

  // Search state pour demarrer une nouvelle conversation
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Scroll to bottom quand les messages changent
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeId]);

  // Realtime : abonner aux nouveaux messages de la conversation active
  useEffect(() => {
    if (!activeId) return;
    const channel = supabase
      .channel(`messages:${activeId}`)
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
            // Eviter les doublons (si on a deja insere optimistement)
            if (prev.some((m) => m.id === msg.id)) return prev;
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

    const channel = supabase
      .channel(`messages:sidebar:${currentUserId}`)
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
      setOtherProfile(conv.other);
      setMessages([]);
      setDraft("");
      setSendError(null);

      // Marquer comme lue
      void markConversationRead(conv.id);
      setConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c)),
      );

      // Charger les messages directement (pas via server action pour eviter un round-trip)
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true })
        .limit(200);
      if (data) setMessages(data as Message[]);

      // Focus sur l'input
      setTimeout(() => inputRef.current?.focus(), 100);
    },
    [supabase],
  );

  // Recherche d'utilisateurs (debouncee)
  useEffect(() => {
    if (!searchOpen || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc("search_users", {
        p_query: searchQuery.trim(),
        p_limit: 10,
      });
      setSearchResults((data as Profile[]) ?? []);
      setSearching(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOpen, supabase]);

  async function startWith(profile: Profile) {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);

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
      // Sinon on l'ajoute en tete et on la selectionne
      const newConv: ConversationSummary = {
        id: convId,
        last_message_at: new Date().toISOString(),
        other: profile,
        lastMessage: null,
        unreadCount: 0,
      };
      setConversations((prev) => [newConv, ...prev]);
      void selectConversation(newConv);
    }
    // Refresh server data en arriere-plan
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

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden flex h-[calc(100vh-180px)] min-h-[480px]">
      {/* Sidebar : liste des conversations */}
      <aside className="w-80 border-r border-slate-200 flex flex-col bg-slate-50/40">
        <div className="p-3 border-b border-slate-200">
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className="w-full text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium py-2 rounded transition flex items-center justify-center gap-2"
          >
            {searchOpen ? "Fermer la recherche" : "+ Nouveau message"}
          </button>
        </div>

        {searchOpen ? (
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 border-b border-slate-200 bg-white">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un membre..."
                autoFocus
                className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-slate-500"
              />
            </div>
            <div className="divide-y divide-slate-100">
              {searching ? (
                <div className="text-xs text-slate-400 px-4 py-6 text-center">
                  Recherche…
                </div>
              ) : searchQuery.trim() && searchResults.length === 0 ? (
                <div className="text-xs text-slate-400 px-4 py-6 text-center">
                  Aucun membre trouvé.
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
              {!searchQuery.trim() && (
                <div className="text-xs text-slate-400 px-4 py-6 text-center">
                  Tapez le nom ou le pseudo d&apos;un membre.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="text-xs text-slate-500 px-4 py-8 text-center">
                Pas encore de conversation.
                <br />
                Cliquez sur <span className="font-medium">+ Nouveau message</span>{" "}
                pour démarrer.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {conversations.map((c) => {
                  const isActive = c.id === activeId;
                  const isMe = c.lastMessage?.sender_id === currentUserId;
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
                })}
              </ul>
            )}
          </div>
        )}
      </aside>

      {/* Main : thread */}
      <section className="flex-1 flex flex-col min-w-0">
        {!activeId || !otherProfile ? (
          <div className="flex-1 flex items-center justify-center text-center px-6">
            <div>
              <div className="text-6xl mb-3 opacity-20">💬</div>
              <h2 className="text-base font-semibold text-slate-900">
                Sélectionne une conversation
              </h2>
              <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto">
                Choisis un échange dans la liste de gauche, ou démarre une nouvelle
                conversation avec un membre.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-4 md:px-5 py-3 border-b border-slate-200 flex items-center gap-3 bg-white">
              <Avatar profile={otherProfile} size={36} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {displayName(otherProfile)}
                </div>
                {otherProfile.username && (
                  <div className="text-[11px] text-slate-500">@{otherProfile.username}</div>
                )}
              </div>
            </div>

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
                        className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                            isMine
                              ? "bg-blue-600 text-white rounded-br-sm"
                              : "bg-white text-slate-900 border border-slate-200 rounded-bl-sm"
                          }`}
                        >
                          {m.body}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-slate-200 p-3 bg-white">
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
          </>
        )}
      </section>
    </div>
  );
}
