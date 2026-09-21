import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  Search,
  Send,
  Paperclip,
  Users,
  Reply,
  Pencil,
  Trash2,
  X,
  MessageSquare,
  FileText,
  Link2,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { api, uploadFile } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../hooks/useSocket.js";
import PageHeader from "../components/PageHeader.jsx";
import {
  Modal,
  Field,
  ErrorBox,
  Empty,
  Loading,
  Avatar,
  Attachments,
} from "../components/UI.jsx";
const displayName = (c, me) =>
  c?.type === "DIRECT"
    ? c.members.find((m) => m.userId !== me)?.user.displayName ||
      "Direct message"
    : c?.name;

const LAST_CHAT_KEY = "collab:last-selected-chat";

const CHAT_SEARCH_TABS = [
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "files", label: "Files", icon: FileText },
  { id: "links", label: "Links", icon: Link2 },
];

function chatBadgeLabel(count) {
  if (!count) return null;
  return count > 99 ? "99+" : String(count);
}

function ReadVisibleMessage({
  enabled,
  messageId,
  className,
  onRead,
  children,
}) {
  const ref = useRef(null);
  useEffect(() => {
    if (!enabled || !ref.current) return;
    let visible = false;
    let timer = null;
    const clear = () => {
      if (timer) window.clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      clear();
      if (
        visible &&
        document.visibilityState === "visible" &&
        document.hasFocus()
      )
        timer = window.setTimeout(() => onRead(messageId), 900);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && entry.intersectionRatio >= 0.6;
        schedule();
      },
      { threshold: [0.6] },
    );
    observer.observe(ref.current);
    const onVisibility = () => schedule();
    const onBlur = () => clear();
    window.addEventListener("focus", schedule);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clear();
      observer.disconnect();
      window.removeEventListener("focus", schedule);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, messageId, onRead]);

  return (
    <div ref={ref} id={`message-${messageId}`} className={className}>
      {children}
    </div>
  );
}

function MessageReceiptStatus({ message, conversation, onOpen }) {
  const receipts = message.receipts || [];
  if (!receipts.length)
    return <span className="text-[10px] text-slate-400">Sent</span>;

  if (conversation.type === "DIRECT") {
    const receipt = receipts[0];
    const label = receipt.readAt
      ? "Read"
      : receipt.deliveredAt
        ? "Delivered"
        : "Sent";
    return <span className="text-[10px] text-slate-400">{label}</span>;
  }

  const delivered = receipts.filter((receipt) => receipt.deliveredAt).length;
  const read = receipts.filter((receipt) => receipt.readAt).length;
  return (
    <span className="flex items-center gap-1 text-[10px] text-slate-400">
      <button
        type="button"
        className="hover:text-slate-700 hover:underline"
        onClick={() => onOpen({ message, type: "delivered" })}
      >
        Delivered to {delivered}
      </button>
      <span>·</span>
      <button
        type="button"
        className="hover:text-slate-700 hover:underline"
        onClick={() => onOpen({ message, type: "read" })}
      >
        Read by {read}
      </button>
    </span>
  );
}

function ReceiptDetails({ details, onClose }) {
  const isRead = details.type === "read";
  const receipts = (details.message.receipts || []).filter((receipt) =>
    isRead ? receipt.readAt : receipt.deliveredAt,
  );
  return (
    <Modal
      title={`${isRead ? "Read by" : "Delivered to"} ${receipts.length}`}
      onClose={onClose}
    >
      {receipts.length ? (
        <div className="space-y-3">
          {receipts.map((receipt) => {
            const timestamp = isRead ? receipt.readAt : receipt.deliveredAt;
            return (
              <div key={receipt.userId} className="flex items-center gap-3">
                <Avatar small name={receipt.user.displayName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {receipt.user.displayName}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No users yet.</p>
      )}
    </Modal>
  );
}
function NewChat({ onClose, onCreated }) {
  const { user } = useAuth();
  const [group, setGroup] = useState(false);
  const [name, setName] = useState("");
  const [members, setMembers] = useState([]);
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api("/users").then((r) => r.data),
  });
  const save = useMutation({
    mutationFn: () =>
      api("/conversations", {
        method: "POST",
        body: JSON.stringify({
          type: group ? "GROUP" : "DIRECT",
          ...(group ? { name } : {}),
          memberIds: members,
        }),
      }),
    onSuccess: (r) => {
      onCreated(r.data);
      onClose();
    },
  });
  return (
    <Modal title="New conversation" onClose={onClose}>
      <div className="tabs mb-5">
        <button
          className={!group ? "active" : ""}
          onClick={() => {
            setGroup(false);
            setMembers([]);
          }}
        >
          Direct message
        </button>
        <button
          className={group ? "active" : ""}
          onClick={() => {
            setGroup(true);
            setMembers([]);
          }}
        >
          Group
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {group && (
          <Field
            label="Group name"
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <Field label={group ? "Members" : "Person"}>
          <select
            className={`input ${group ? "h-40" : ""}`}
            multiple={group}
            required
            value={group ? members : members[0] || ""}
            onChange={(e) =>
              setMembers([...e.target.selectedOptions].map((o) => o.value))
            }
          >
            {!group && <option value="">Choose a colleague</option>}
            {users.data
              ?.filter((u) => u.id !== user.id && u.status === "ACTIVE")
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
          </select>
        </Field>
        {group && (
          <p className="mt-2 text-xs text-slate-400">
            Hold Ctrl / Cmd to select multiple people.
          </p>
        )}
        <ErrorBox error={save.error} />
        <div className="form-actions">
          <button className="btn-primary" disabled={save.isPending}>
            Start conversation
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Members({ conversation, onClose }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [id, setId] = useState("");
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api("/users").then((r) => r.data),
  });
  const save = useMutation({
    mutationFn: (remove) =>
      remove
        ? api(`/conversations/${conversation.id}/members/${remove}`, {
            method: "DELETE",
          })
        : api(`/conversations/${conversation.id}/members`, {
            method: "POST",
            body: JSON.stringify({ userId: id }),
          }),
    onSuccess: () => {
      setId("");
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
  const owner = conversation.ownerId === user.id;
  return (
    <Modal title="Conversation members" onClose={onClose}>
      <div className="space-y-4">
        {conversation.members.map((m) => (
          <div key={m.userId} className="flex items-center gap-3 text-sm">
            <Avatar small name={m.user.displayName} />
            <span className="flex-1">{m.user.displayName}</span>
            <span className="text-xs text-slate-400">
              {m.role.toLowerCase()}
            </span>
            {owner &&
              m.userId !== user.id &&
              conversation.type !== "DIRECT" && (
                <button
                  className="icon-btn"
                  aria-label={`Remove ${m.user.displayName}`}
                  onClick={() => save.mutate(m.userId)}
                >
                  <X size={16} />
                </button>
              )}
          </div>
        ))}
      </div>
      {owner && conversation.type !== "DIRECT" && (
        <form
          className="mt-6 flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(null);
          }}
        >
          <select
            aria-label="Add member"
            className="input"
            required
            value={id}
            onChange={(e) => setId(e.target.value)}
          >
            <option value="">Add a colleague…</option>
            {users.data
              ?.filter(
                (u) =>
                  u.status === "ACTIVE" &&
                  !conversation.members.some((m) => m.userId === u.id),
              )
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
          </select>
          <button className="btn-primary" disabled={save.isPending}>
            Add
          </button>
        </form>
      )}
      {!owner && conversation.type !== "DIRECT" && (
        <button
          className="btn-danger mt-6"
          onClick={async () => {
            await save.mutateAsync(user.id);
            onClose();
          }}
        >
          Leave group
        </button>
      )}
      <ErrorBox error={save.error} />
    </Modal>
  );
}
export default function ChatPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const lastChatKey = `${LAST_CHAT_KEY}:${user.id}`;
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedConversationId = searchParams.get("conversation");
  const linkedMessageId = searchParams.get("message");
  const [selectedId, setSelectedId] = useState(() =>
    linkedConversationId || sessionStorage.getItem(lastChatKey),
  );
  const [focusMessageId, setFocusMessageId] = useState(linkedMessageId);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [reply, setReply] = useState(null);
  const [newChat, setNewChat] = useState(false);
  const [members, setMembers] = useState(false);
  const [search, setSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [searchType, setSearchType] = useState("messages");
  const [searchOpen, setSearchOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [receiptDetails, setReceiptDetails] = useState(null);
  const [unreadMarker, setUnreadMarker] = useState(null);
  const [nearBottom, setNearBottom] = useState(true);
  const bottom = useRef(null);
  const scrollArea = useRef(null);
  const positionedConversation = useRef(null);
  const previousTail = useRef({ conversationId: null, messageId: null });
  const submittedReads = useRef(new Set());
  const pendingReads = useRef(new Set());
  const readFlushTimer = useRef(null);
  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api("/conversations").then((r) => r.data),
  });
  const selected = conversations.data?.find((c) => c.id === selectedId);
  const normalizedMessageSearch = messageSearch.trim();
  const messages = useInfiniteQuery({
    queryKey: ["messages", selectedId],
    enabled: Boolean(selectedId),
    initialPageParam: undefined,
    queryFn: ({ pageParam }) =>
      api(
        `/conversations/${selectedId}/messages${pageParam ? `?cursor=${pageParam}` : ""}`,
      ),
    getNextPageParam: (page) => page.meta.nextCursor || undefined,
  });
  const results = useQuery({
    queryKey: [
      "message-search",
      selectedId,
      searchType,
      normalizedMessageSearch,
    ],
    enabled: Boolean(
      selectedId &&
        searchOpen &&
        (searchType !== "messages" || normalizedMessageSearch.length >= 2),
    ),
    queryFn: () =>
      api(
        `/messages/search?${new URLSearchParams({
          q: normalizedMessageSearch,
          conversationId: selectedId,
          type: searchType,
        })}`,
      ).then((r) => r.data),
  });
  const allMessages = useMemo(
    () => messages.data?.pages.toReversed().flatMap((p) => p.data) || [],
    [messages.data],
  );
  const tail = allMessages.at(-1)?.id;
  const unreadMessageIds = useMemo(
    () =>
      new Set(
        allMessages
          .filter(
            (message) =>
              message.senderId !== user.id &&
              message.receipts?.some(
                (receipt) => receipt.userId === user.id && !receipt.readAt,
              ),
          )
          .map((message) => message.id),
      ),
    [allMessages, user.id],
  );
  const firstUnreadId = allMessages.find((message) =>
    unreadMessageIds.has(message.id),
  )?.id;

  useEffect(() => {
    if (!selectedId) {
      setUnreadMarker(null);
      return;
    }
    if (firstUnreadId) {
      setUnreadMarker((current) =>
        current?.conversationId === selectedId
          ? current
          : {
              conversationId: selectedId,
              messageId: firstUnreadId,
              count: selected?.unreadCount || unreadMessageIds.size,
            },
      );
    } else if (unreadMarker?.conversationId === selectedId) {
      setUnreadMarker(null);
    }
  }, [
    selectedId,
    firstUnreadId,
    selected?.unreadCount,
    unreadMessageIds.size,
    unreadMarker?.conversationId,
  ]);

  const clearLinkedTarget = () => {
    if (!linkedConversationId && !linkedMessageId) return;
    const next = new URLSearchParams(searchParams);
    next.delete("conversation");
    next.delete("message");
    setSearchParams(next, { replace: true });
  };

  const selectConversation = (id) => {
    clearLinkedTarget();
    setFocusMessageId(null);
    setSelectedId(id);
    if (id) sessionStorage.setItem(lastChatKey, id);
  };

  const queueMessageRead = useCallback(
    (messageId) => {
      if (submittedReads.current.has(messageId)) return;
      submittedReads.current.add(messageId);
      pendingReads.current.add(messageId);
      if (readFlushTimer.current) return;
      readFlushTimer.current = window.setTimeout(async () => {
        const ids = [...pendingReads.current];
        pendingReads.current.clear();
        readFlushTimer.current = null;
        if (!ids.length) return;
        try {
          await api("/messages/receipts/read", {
            method: "POST",
            body: JSON.stringify({ messageIds: ids }),
          });
          qc.invalidateQueries({ queryKey: ["messages"] });
          qc.invalidateQueries({ queryKey: ["conversations"] });
          qc.invalidateQueries({ queryKey: ["notifications"] });
        } catch {
          ids.forEach((id) => submittedReads.current.delete(id));
        }
      }, 150);
    },
    [qc],
  );

  useEffect(
    () => () => {
      if (readFlushTimer.current) window.clearTimeout(readFlushTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!conversations.data) return;
    if (
      linkedConversationId &&
      conversations.data.some((c) => c.id === linkedConversationId)
    ) {
      setSelectedId(linkedConversationId);
      sessionStorage.setItem(lastChatKey, linkedConversationId);
      return;
    }
    if (selectedId && !conversations.data.some((c) => c.id === selectedId)) {
      setSelectedId(null);
      sessionStorage.removeItem(lastChatKey);
    }
  }, [conversations.data, linkedConversationId, selectedId]);

  useEffect(() => {
    if (linkedMessageId) setFocusMessageId(linkedMessageId);
  }, [linkedMessageId]);

  useEffect(() => {
    setText("");
    setFile(null);
    setReply(null);
    setMessageSearch("");
    setSearchType("messages");
    setSearchOpen(false);
    setNearBottom(true);
    positionedConversation.current = null;
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || messages.isLoading || !allMessages.length) return;
    if (linkedMessageId || focusMessageId) return;
    if (positionedConversation.current === selectedId) return;
    const target = firstUnreadId
      ? document.getElementById(`message-${firstUnreadId}`)
      : bottom.current;
    target?.scrollIntoView({ block: firstUnreadId ? "center" : "nearest" });
    positionedConversation.current = selectedId;
    previousTail.current = { conversationId: selectedId, messageId: tail };
  }, [
    selectedId,
    messages.isLoading,
    allMessages.length,
    linkedMessageId,
    focusMessageId,
    firstUnreadId,
    tail,
  ]);

  useEffect(() => {
    if (!tail || !selectedId) return;
    const previous = previousTail.current;
    const changed =
      previous.conversationId === selectedId &&
      previous.messageId &&
      previous.messageId !== tail;
    if (changed && nearBottom)
      bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    previousTail.current = { conversationId: selectedId, messageId: tail };
  }, [tail, selectedId, nearBottom]);

  useEffect(() => {
    if (!focusMessageId || messages.isLoading || !selectedId) return;
    const element = document.getElementById(`message-${focusMessageId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      positionedConversation.current = selectedId;
      previousTail.current = { conversationId: selectedId, messageId: tail };
      clearLinkedTarget();
      const timeout = window.setTimeout(() => setFocusMessageId(null), 2500);
      return () => window.clearTimeout(timeout);
    }
    if (messages.hasNextPage && !messages.isFetchingNextPage)
      messages.fetchNextPage();
  }, [
    focusMessageId,
    allMessages,
    messages.isLoading,
    messages.hasNextPage,
    messages.isFetchingNextPage,
    selectedId,
  ]);

  useSocket({
    "message:created": (p) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["messages", p.conversationId] });
    },
    "message:updated": (p) => {
      qc.invalidateQueries({ queryKey: ["messages", p.conversationId] });
      qc.invalidateQueries({ queryKey: ["message-search"] });
    },
    "message:deleted": (p) => {
      qc.invalidateQueries({ queryKey: ["messages", p.conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["message-search"] });
    },
    "message:receipt-updated": (p) => {
      qc.invalidateQueries({ queryKey: ["messages", p.conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
  const send = useMutation({
    mutationFn: async ({ id, content, attachment, replyId }) =>
      api(`/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content,
          attachmentIds: attachment ? [(await uploadFile(attachment)).id] : [],
          replyToMessageId: replyId,
        }),
      }),
    onSuccess: (_, vars) => {
      if (vars.id === selectedId) {
        setText("");
        setFile(null);
        setReply(null);
      }
      qc.invalidateQueries({ queryKey: ["messages", vars.id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
  const change = useMutation({
    mutationFn: ({ id, remove }) =>
      api(`/messages/${id}`, {
        method: remove ? "DELETE" : "PATCH",
        ...(remove ? {} : { body: JSON.stringify({ content: editText }) }),
      }),
    onSuccess: () => {
      setEditing(null);
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["messages"] });
    },
  });
  const submit = () => {
    if (selectedId && (text.trim() || file) && !send.isPending)
      send.mutate({
        id: selectedId,
        content: text,
        attachment: file,
        replyId: reply?.id || null,
      });
  };
  const jumpToMessage = (messageId) => {
    if (!messageId) return;
    setSearchOpen(false);
    positionedConversation.current = null;
    setFocusMessageId(messageId);
  };
  return (
    <>
      <PageHeader
        title="Messages"
        description="A conversation for every person and every team."
        action={
          <button className="btn-primary" onClick={() => setNewChat(true)}>
            <Plus size={17} />
            New conversation
          </button>
        }
      />
      <ErrorBox error={conversations.error} />
      <div className="card flex overflow-hidden h-[calc(100dvh-185px)] min-h-[520px]">
        <aside className="w-20 sm:w-64 shrink-0 border-r border-slate-200 flex flex-col">
          <div className="p-4 hidden sm:block">
            <input
              className="input"
              aria-label="Search conversations"
              placeholder="Find a conversation"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.data
              ?.filter((c) =>
                displayName(c, user.id)
                  ?.toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((c) => (
                <button
                  key={c.id}
                  title={displayName(c, user.id)}
                  onClick={() => selectConversation(c.id)}
                  className={`flex w-full gap-3 items-center p-4 text-left border-l-2 ${c.id === selectedId ? "border-blue-600 bg-blue-50/70" : "border-transparent hover:bg-slate-50"}`}
                >
                  <Avatar name={displayName(c, user.id)} />
                  <div className="hidden sm:block min-w-0 flex-1">
                    <div className="flex justify-between items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        {displayName(c, user.id)}
                      </span>
                      {c.unreadCount > 0 && (
                        <span className="rounded-full px-1.5 py-0.5 bg-blue-600 text-white text-[10px]">
                          {chatBadgeLabel(c.unreadCount)}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs mt-1 text-slate-400">
                      {c.messages[0]?.content ||
                        (c.messages[0] ? "Attachment" : "Start a conversation")}
                    </p>
                  </div>
                </button>
              ))}
          </div>
        </aside>
        <section className="flex flex-1 min-w-0 flex-col">
          {selected ? (
            <>
              <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-sm truncate">
                    {displayName(selected, user.id)}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    {selected.members.length} members
                  </p>
                </div>
                <div className="relative hidden w-64 sm:block lg:w-80">
                  <div className="relative">
                    <Search
                      size={16}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      className="input pl-9 pr-9"
                      placeholder={
                        searchType === "files"
                          ? "Search files"
                          : searchType === "links"
                            ? "Search links"
                            : "Search messages"
                      }
                      aria-label="Search conversation"
                      value={messageSearch}
                      onFocus={() => setSearchOpen(true)}
                      onChange={(e) => {
                        setMessageSearch(e.target.value);
                        setSearchOpen(true);
                      }}
                    />
                    {searchOpen && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Close search"
                        onClick={() => setSearchOpen(false)}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                  {searchOpen && (
                    <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[420px] max-w-[80vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                      <div className="flex border-b border-slate-100 p-1.5">
                        {CHAT_SEARCH_TABS.map(
                          ({ id, label, icon: SearchTypeIcon }) => (
                            <button
                              key={id}
                              type="button"
                              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition ${
                                searchType === id
                                  ? "bg-blue-50 text-blue-700"
                                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                              }`}
                              onClick={() => setSearchType(id)}
                            >
                              <SearchTypeIcon size={14} />
                              {label}
                            </button>
                          ),
                        )}
                      </div>
                      <div className="max-h-96 overflow-y-auto p-2">
                        {searchType === "messages" &&
                        normalizedMessageSearch.length < 2 ? (
                          <p className="px-3 py-8 text-center text-xs text-slate-400">
                            Type at least 2 characters to search messages.
                          </p>
                        ) : results.isLoading ? (
                          <div className="py-6">
                            <Loading />
                          </div>
                        ) : results.error ? (
                          <ErrorBox error={results.error} />
                        ) : !results.data?.length ? (
                          <p className="px-3 py-8 text-center text-xs text-slate-400">
                            No {searchType} found in this conversation.
                          </p>
                        ) : searchType === "messages" ? (
                          <div className="space-y-1">
                            {results.data.map((result) => (
                              <button
                                key={result.id}
                                type="button"
                                className="w-full rounded-lg p-3 text-left hover:bg-slate-50"
                                onClick={() => jumpToMessage(result.id)}
                              >
                                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                  <span className="font-semibold text-slate-600">
                                    {result.sender.displayName}
                                  </span>
                                  <span>·</span>
                                  <span>
                                    {new Date(result.createdAt).toLocaleString()}
                                  </span>
                                  <ArrowRight
                                    size={13}
                                    className="ml-auto shrink-0"
                                  />
                                </div>
                                <p className="mt-1 truncate text-sm text-slate-700">
                                  {result.content || "Message"}
                                </p>
                              </button>
                            ))}
                          </div>
                        ) : searchType === "files" ? (
                          <div className="space-y-2">
                            {results.data.map((result) => (
                              <div
                                key={result.id}
                                className="rounded-lg border border-slate-100 p-3"
                              >
                                <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-400">
                                  <span className="font-semibold text-slate-600">
                                    {result.sender.displayName}
                                  </span>
                                  <span>·</span>
                                  <span>
                                    {new Date(result.createdAt).toLocaleString()}
                                  </span>
                                </div>
                                <Attachments items={[{ file: result.file }]} />
                                <button
                                  type="button"
                                  className="mt-2 flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                                  onClick={() =>
                                    jumpToMessage(result.messageId)
                                  }
                                >
                                  Go to message
                                  <ArrowRight size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {results.data.map((result) => (
                              <div
                                key={result.id}
                                className="rounded-lg border border-slate-100 p-3"
                              >
                                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                  <span className="font-semibold text-slate-600">
                                    {result.sender.displayName}
                                  </span>
                                  <span>·</span>
                                  <span>
                                    {new Date(result.createdAt).toLocaleString()}
                                  </span>
                                </div>
                                <a
                                  className="mt-2 flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline"
                                  href={result.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <Link2 size={14} className="shrink-0" />
                                  <span className="min-w-0 flex-1 truncate">
                                    {result.url}
                                  </span>
                                  <ExternalLink size={13} className="shrink-0" />
                                </a>
                                <p className="mt-1 truncate text-xs text-slate-500">
                                  {result.messagePreview}
                                </p>
                                <button
                                  type="button"
                                  className="mt-2 flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                                  onClick={() =>
                                    jumpToMessage(result.messageId)
                                  }
                                >
                                  Go to message
                                  <ArrowRight size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  className="icon-btn"
                  aria-label="Conversation members"
                  onClick={() => setMembers(true)}
                >
                  <Users size={18} />
                </button>
              </header>
              <div
                ref={scrollArea}
                className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-50/50"
                onScroll={(event) => {
                  const element = event.currentTarget;
                  setNearBottom(
                    element.scrollHeight - element.scrollTop - element.clientHeight <
                      96,
                  );
                }}
              >
                {messages.isLoading ? (
                  <Loading />
                ) : (
                  <>
                    {messages.hasNextPage && (
                      <button
                        className="btn-secondary mx-auto block text-xs"
                        onClick={() => messages.fetchNextPage()}
                        disabled={messages.isFetchingNextPage}
                      >
                        Load earlier messages
                      </button>
                    )}
                    {allMessages.map((m) => {
                      const own = m.senderId === user.id;
                      const unread =
                        !own &&
                        m.receipts?.some(
                          (receipt) =>
                            receipt.userId === user.id && !receipt.readAt,
                        );
                      const showUnreadDivider =
                        unreadMarker?.conversationId === selectedId &&
                        unreadMarker.messageId === m.id;
                      return (
                        <Fragment key={m.id}>
                          {showUnreadDivider && (
                            <div className="flex items-center gap-3 py-1 text-[11px] font-semibold text-blue-600">
                              <span className="h-px flex-1 bg-blue-200" />
                              <span>
                                {unreadMarker.count === 1
                                  ? "1 new message"
                                  : `${unreadMarker.count} new messages`}
                              </span>
                              <span className="h-px flex-1 bg-blue-200" />
                            </div>
                          )}
                          <ReadVisibleMessage
                            enabled={Boolean(unread)}
                            messageId={m.id}
                            onRead={queueMessageRead}
                            className={`flex gap-2 ${own ? "flex-row-reverse" : ""} ${focusMessageId === m.id ? "rounded-xl ring-2 ring-blue-300 ring-offset-2" : ""}`}
                          >
                            {!own && <Avatar small name={m.sender.displayName} />}
                            <div className="max-w-[90%] sm:max-w-[78%] min-w-0">
                              <div
                                className={`mb-1 text-[10px] text-slate-400 ${own ? "text-right" : ""}`}
                              >
                                {own ? "You" : m.sender.displayName} ·{" "}
                                {new Date(m.createdAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                                {m.editedAt ? " · edited" : ""}
                              </div>
                              <div
                                className={`p-3.5 rounded-2xl ${own ? "bg-blue-600 text-white rounded-tr-md" : "bg-white border border-slate-200 rounded-tl-md"}`}
                              >
                                {m.replyToMessage && (
                                  <div className="border-l-2 pl-2 mb-3 opacity-60 text-xs truncate">
                                    {m.replyToMessage.sender.displayName}:{" "}
                                    {m.replyToMessage.content || "Message"}
                                  </div>
                                )}
                                <p className="text-sm leading-6 whitespace-pre-wrap break-words">
                                  {m.deletedAt ? (
                                    <em className="opacity-60">
                                      Message deleted
                                    </em>
                                  ) : (
                                    m.content
                                  )}
                                </p>
                                {!m.deletedAt && m.attachments.length > 0 && (
                                  <div className="mt-2">
                                    <Attachments items={m.attachments} />
                                  </div>
                                )}
                              </div>
                              {!m.deletedAt && (
                                <div
                                  className={`flex gap-1 mt-1 ${own ? "justify-end" : ""}`}
                                >
                                  <button
                                    title="Reply"
                                    aria-label="Reply to message"
                                    className="icon-btn p-1"
                                    onClick={() => setReply(m)}
                                  >
                                    <Reply size={12} />
                                  </button>
                                  {own && (
                                    <>
                                      <button
                                        title="Edit message"
                                        aria-label="Edit message"
                                        className="icon-btn p-1"
                                        onClick={() => {
                                          setEditing(m);
                                          setEditText(m.content);
                                        }}
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button
                                        title="Delete message"
                                        aria-label="Delete message"
                                        className="icon-btn p-1"
                                        onClick={() => setDeleting(m)}
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                              {own && !m.deletedAt && (
                                <div className="mt-1 flex justify-end">
                                  <MessageReceiptStatus
                                    message={m}
                                    conversation={selected}
                                    onOpen={setReceiptDetails}
                                  />
                                </div>
                              )}
                            </div>
                          </ReadVisibleMessage>
                        </Fragment>
                      );
                    })}
                    {!allMessages.length && (
                      <Empty
                        title="Say hello"
                        text="Send the first message to start the conversation."
                      />
                    )}
                    <div ref={bottom} />
                    {selected.unreadCount > 0 && !nearBottom && (
                      <button
                        type="button"
                        className="sticky bottom-2 z-10 mx-auto block rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 shadow-sm"
                        onClick={() =>
                          bottom.current?.scrollIntoView({
                            behavior: "smooth",
                            block: "end",
                          })
                        }
                      >
                        ↓ {chatBadgeLabel(selected.unreadCount)} new messages
                      </button>
                    )}
                  </>
                )}
                <ErrorBox error={messages.error} />
              </div>
              <div className="border-t border-slate-100 p-4">
                {reply && (
                  <div className="flex items-center gap-2 text-xs bg-blue-50 rounded-lg p-2 mb-2">
                    <Reply size={14} />
                    <span className="truncate flex-1">
                      Replying to {reply.sender.displayName}: {reply.content}
                    </span>
                    <button
                      aria-label="Cancel reply"
                      onClick={() => setReply(null)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                {file && (
                  <div className="flex gap-2 text-xs text-slate-500 mb-2">
                    <Paperclip size={13} />
                    {file.name}
                    <button
                      aria-label="Remove attachment"
                      onClick={() => setFile(null)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}
                <form
                  className="flex gap-2 items-end"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                  }}
                >
                  <label
                    className="icon-btn mb-1 cursor-pointer"
                    title="Attach file"
                  >
                    <Paperclip size={20} />
                    <input
                      type="file"
                      className="sr-only"
                      aria-label="Message attachment"
                      onChange={(e) => setFile(e.target.files[0])}
                    />
                  </label>
                  <textarea
                    className="input resize-none min-h-12"
                    rows={1}
                    aria-label="Message"
                    placeholder="Write a message…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        submit();
                      }
                    }}
                  />
                  <button
                    className="btn-primary px-3"
                    aria-label="Send message"
                    disabled={send.isPending || (!text.trim() && !file)}
                  >
                    <Send size={18} />
                  </button>
                </form>
                <ErrorBox error={send.error} />
                <p className="hidden sm:block text-[10px] text-slate-400 mt-2 ml-11">
                  Enter to send · Shift + Enter for a new line
                </p>
              </div>
            </>
          ) : (
            <Empty
              title="Select a conversation"
              text="Choose a conversation from the list to start messaging."
            />
          )}
        </section>
      </div>
      {newChat && (
        <NewChat
          onClose={() => setNewChat(false)}
          onCreated={(conversation) => {
            qc.setQueryData(["conversations"], (items = []) => [
              {
                ...conversation,
                messages: conversation.messages || [],
                unreadCount: 0,
              },
              ...items.filter((item) => item.id !== conversation.id),
            ]);
            selectConversation(conversation.id);
            qc.invalidateQueries({ queryKey: ["conversations"] });
          }}
        />
      )}{" "}
      {members && selected && (
        <Members conversation={selected} onClose={() => setMembers(false)} />
      )}{" "}
      {editing && (
        <Modal title="Edit message" onClose={() => setEditing(null)}>
          <textarea
            className="input min-h-28"
            aria-label="Edited message"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
          />
          <ErrorBox error={change.error} />
          <div className="form-actions">
            <button
              className="btn-primary"
              disabled={change.isPending || !editText.trim()}
              onClick={() => change.mutate({ id: editing.id })}
            >
              Save
            </button>
          </div>
        </Modal>
      )}
      {receiptDetails && (
        <ReceiptDetails
          details={receiptDetails}
          onClose={() => setReceiptDetails(null)}
        />
      )}{" "}
      {deleting && (
        <Modal title="Delete message?" onClose={() => setDeleting(null)}>
          <p className="text-sm text-slate-500">
            The message will be replaced with “Message deleted”.
          </p>
          <ErrorBox error={change.error} />
          <div className="form-actions">
            <button className="btn-secondary" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button
              className="btn-danger"
              disabled={change.isPending}
              onClick={() => change.mutate({ id: deleting.id, remove: true })}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
