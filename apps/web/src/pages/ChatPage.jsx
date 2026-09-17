import { useEffect, useMemo, useRef, useState } from "react";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedConversationId = searchParams.get("conversation");
  const linkedMessageId = searchParams.get("message");
  const [selectedId, setSelectedId] = useState(linkedConversationId);
  const [focusMessageId, setFocusMessageId] = useState(linkedMessageId);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [reply, setReply] = useState(null);
  const [newChat, setNewChat] = useState(false);
  const [members, setMembers] = useState(false);
  const [search, setSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState("");
  const [deleting, setDeleting] = useState(null);
  const bottom = useRef(null);
  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api("/conversations").then((r) => r.data),
  });
  const selected = conversations.data?.find((c) => c.id === selectedId);
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
    queryKey: ["message-search", selectedId, messageSearch],
    enabled: Boolean(selectedId && messageSearch.length >= 2),
    queryFn: () =>
      api(
        `/messages/search?${new URLSearchParams({ q: messageSearch, conversationId: selectedId })}`,
      ).then((r) => r.data),
  });
  const allMessages = useMemo(
    () => messages.data?.pages.toReversed().flatMap((p) => p.data) || [],
    [messages.data],
  );
  const tail = allMessages.at(-1)?.id;

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
  };

  useEffect(() => {
    if (!conversations.data) return;
    if (
      linkedConversationId &&
      conversations.data.some((c) => c.id === linkedConversationId)
    ) {
      setSelectedId(linkedConversationId);
      return;
    }
    if (!conversations.data.some((c) => c.id === selectedId))
      setSelectedId(conversations.data[0]?.id || null);
  }, [conversations.data, linkedConversationId, selectedId]);

  useEffect(() => {
    if (linkedMessageId) setFocusMessageId(linkedMessageId);
  }, [linkedMessageId]);

  useEffect(() => {
    setText("");
    setFile(null);
    setReply(null);
    setMessageSearch("");
  }, [selectedId]);

  useEffect(() => {
    if (!linkedMessageId)
      bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (tail && selectedId)
      api(`/conversations/${selectedId}/read`, {
        method: "POST",
        body: JSON.stringify({ messageId: tail }),
      })
        .then(() => qc.invalidateQueries({ queryKey: ["conversations"] }))
        .catch(() => {});
  }, [tail, selectedId, qc]);

  useEffect(() => {
    if (!focusMessageId || messages.isLoading || !selectedId) return;
    const element = document.getElementById(`message-${focusMessageId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
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
                          {c.unreadCount}
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
                <input
                  className="input max-w-44 hidden md:block"
                  placeholder="Search messages"
                  aria-label="Search messages"
                  value={messageSearch}
                  onChange={(e) => setMessageSearch(e.target.value)}
                />
                <button
                  className="icon-btn"
                  aria-label="Conversation members"
                  onClick={() => setMembers(true)}
                >
                  <Users size={18} />
                </button>
              </header>
              <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-50/50">
                {messages.isLoading ? (
                  <Loading />
                ) : (
                  <>
                    {messages.hasNextPage && messageSearch.length < 2 && (
                      <button
                        className="btn-secondary mx-auto block text-xs"
                        onClick={() => messages.fetchNextPage()}
                        disabled={messages.isFetchingNextPage}
                      >
                        Load earlier messages
                      </button>
                    )}
                    {(messageSearch.length >= 2
                      ? results.data?.toReversed() || []
                      : allMessages
                    ).map((m) => {
                      const own = m.senderId === user.id;
                      return (
                        <div
                          id={`message-${m.id}`}
                          key={m.id}
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
                          </div>
                        </div>
                      );
                    })}
                    {!allMessages.length && (
                      <Empty
                        title="Say hello"
                        text="Send the first message to start the conversation."
                      />
                    )}
                    <div ref={bottom} />
                  </>
                )}
                <ErrorBox error={messages.error || results.error} />
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
              title="Bring your team together"
              text="Start a direct message or create a group."
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
