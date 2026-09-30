import { useEffect, useRef, useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  Info,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Send,
  Shield,
  User,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSession } from "@/hooks/use-session";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  listChatConversations,
  getChatMessages,
  sendChatMessage,
  markConversationRead,
  listAvailableChatUsers,
  qk,
} from "@/lib/crm-api";
import type {
  ChatConversationSummary,
  ChatMessage,
  ChatParticipant,
} from "@/lib/db-types";

type ChatSearch = { c?: string };

export const Route = createFileRoute("/app/chat")({
  validateSearch: (search: Record<string, unknown>): ChatSearch => {
    const rawC = search["c"];
    if (typeof rawC === "string" && rawC.trim()) {
      return { c: rawC.trim() };
    }
    return {};
  },
  head: () => ({
    meta: [
      { title: "Team Chat · BLUETORN CRM" },
      { name: "description", content: "Direct 1:1 messaging across your workspace team." },
      { property: "og:title", content: "Team Chat · BLUETORN CRM" },
      { property: "og:description", content: "Direct 1:1 messaging across your workspace team." },
    ],
  }),
  component: TeamChatPage,
});

function formatMessageTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatMessageDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) {
      return "Today";
    }
    if (d.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

export function TeamChatPage() {
  const searchParams = Route.useSearch();
  const queryClient = useQueryClient();
  const { user: currentUser, isViewingAs } = useSession();

  const [activeConvId, setActiveConvId] = useState<string | null>(searchParams.c ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [composerText, setComposerText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // 1. Fetch conversations list
  const {
    data: conversations = [],
    isLoading: convsLoading,
    error: convsError,
  } = useQuery({
    queryKey: qk.chatConversations(),
    queryFn: () => listChatConversations(),
    refetchInterval: 3000,
  });

  // 2. Fetch active conversation messages
  const {
    data: activeChatData,
    isLoading: messagesLoading,
    error: messagesError,
  } = useQuery({
    queryKey: qk.chatMessages(activeConvId ?? ""),
    queryFn: () => getChatMessages(activeConvId!),
    enabled: Boolean(activeConvId),
    refetchInterval: 3000,
  });

  // 3. Fetch available users for "New Chat" modal
  const { data: availableUsers = [] } = useQuery({
    queryKey: qk.chatAvailableUsers(),
    queryFn: () => listAvailableChatUsers(),
    enabled: newChatOpen,
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    if (activeChatData?.messages) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeChatData?.messages?.length, activeConvId]);

  // Mark conversation read when viewing
  useEffect(() => {
    if (activeConvId) {
      markConversationRead(activeConvId).catch(() => {});
      queryClient.invalidateQueries({ queryKey: qk.chatUnreadCount() });
    }
  }, [activeConvId, queryClient]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: (text: string) => {
      const payload: { conversationId?: string; body: string } = { body: text };
      if (activeConvId) {
        payload.conversationId = activeConvId;
      }
      return sendChatMessage(payload);
    },
    onSuccess: (result) => {
      setComposerText("");
      queryClient.invalidateQueries({ queryKey: qk.chatMessages(result.conversationId) });
      queryClient.invalidateQueries({ queryKey: qk.chatConversations() });
      queryClient.invalidateQueries({ queryKey: qk.chatUnreadCount() });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to send message.");
    },
  });

  // Start new conversation mutation
  const startChatMutation = useMutation({
    mutationFn: (recipientId: string) =>
      sendChatMessage({
        recipientId,
        body: "Hello! Starting a new conversation.",
      }),
    onSuccess: (result) => {
      setNewChatOpen(false);
      queryClient.invalidateQueries({ queryKey: qk.chatConversations() });
      setActiveConvId(result.conversationId);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not start conversation.");
    },
  });

  const handleSendMessage = () => {
    const trimmed = composerText.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Filter conversations
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.participant.full_name.toLowerCase().includes(q) ||
        c.participant.user_code.toLowerCase().includes(q) ||
        (c.lastMessage?.body && c.lastMessage.body.toLowerCase().includes(q)),
    );
  }, [conversations, searchQuery]);

  // Group messages by date
  const groupedMessages = useMemo(() => {
    if (!activeChatData?.messages) return [];
    const groups: { date: string; messages: ChatMessage[] }[] = [];
    let currentDate = "";
    let currentGroup: ChatMessage[] = [];

    for (const msg of activeChatData.messages) {
      const msgDate = formatMessageDate(msg.created_at);
      if (msgDate !== currentDate) {
        if (currentGroup.length > 0) {
          groups.push({ date: currentDate, messages: currentGroup });
        }
        currentDate = msgDate;
        currentGroup = [msg];
      } else {
        currentGroup.push(msg);
      }
    }
    if (currentGroup.length > 0) {
      groups.push({ date: currentDate, messages: currentGroup });
    }
    return groups;
  }, [activeChatData?.messages]);

  const activeParticipant = activeChatData?.participant;
  const retentionDays = activeChatData?.retentionDays ?? 15;

  return (
    <div className="relative flex h-[calc(100vh-8.5rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:h-[calc(100vh-7.5rem)]">
      <div className="flex h-full w-full">
        {/* ========================================================================= */}
        {/* LEFT PANE: Conversation List (Full screen on mobile if no active chat) */}
        {/* ========================================================================= */}
        <aside
          className={cn(
            "flex h-full w-full flex-col border-r border-border bg-card transition-all lg:w-80 lg:shrink-0 xl:w-96",
            activeConvId ? "hidden lg:flex" : "flex",
          )}
        >
          {/* Header */}
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <h1 className="text-base font-semibold text-foreground">Team Chat</h1>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Retention info popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                    <Info className="h-4 w-4" />
                    <span className="sr-only">Retention policy</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 space-y-2 p-3.5 text-xs">
                  <p className="font-semibold text-foreground">Message retention</p>
                  <p className="text-muted-foreground leading-relaxed">
                    Team Chat messages are automatically deleted after {retentionDays} days.
                    <br />
                    Workspace retention is managed by the system administrator.
                  </p>
                </PopoverContent>
              </Popover>

              {/* Start new chat button */}
              <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="default" className="h-8 gap-1.5 px-2.5 text-xs">
                    <Plus className="h-3.5 w-3.5" />
                    <span>New chat</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Start a Conversation</DialogTitle>
                    <DialogDescription>
                      Select an active team member from your workspace to message.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
                    {availableUsers.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        No other active team members found in this workspace.
                      </p>
                    ) : (
                      availableUsers.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            // Check if conversation already exists
                            const existing = conversations.find((c) => c.participant.id === u.id);
                            if (existing) {
                              setNewChatOpen(false);
                              setActiveConvId(existing.id);
                            } else {
                              startChatMutation.mutate(u.id);
                            }
                          }}
                          disabled={startChatMutation.isPending}
                          className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
                        >
                          <Avatar className="h-9 w-9">
                            {u.avatar_url && <AvatarImage src={u.avatar_url} />}
                            <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                              {initials(u.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{u.full_name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {u.job_title ?? u.role ?? u.user_code}
                            </p>
                          </div>
                          <span className="text-xs text-primary font-medium">Chat</span>
                        </button>
                      ))
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Search bar */}
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search conversations…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-8 text-xs"
              />
            </div>
          </div>

          {/* Conversations Scroll Area */}
          <div className="flex-1 overflow-y-auto">
            {convsLoading ? (
              <div className="flex h-32 items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading conversations…
              </div>
            ) : convsError ? (
              <div className="p-4 text-center text-xs text-destructive">
                Failed to load conversations: {(convsError as Error).message}
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-6 text-center">
                <EmptyState
                  icon={MessageSquare}
                  title="No conversations"
                  description={
                    searchQuery
                      ? "No conversations match your search."
                      : "Start a 1:1 conversation with any colleague."
                  }
                  action={
                    !searchQuery ? (
                      <Button size="sm" onClick={() => setNewChatOpen(true)} className="mt-2 text-xs">
                        Start new chat
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {filteredConversations.map((c) => {
                  const isActive = c.id === activeConvId;
                  const isDeactivated = !c.participant.is_active;

                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setActiveConvId(c.id)}
                        className={cn(
                          "flex w-full items-start gap-3 p-3.5 text-left transition-colors",
                          isActive
                            ? "bg-accent/80 text-accent-foreground"
                            : "hover:bg-muted/50 text-foreground",
                        )}
                      >
                        <div className="relative">
                          <Avatar className="h-10 w-10">
                            {c.participant.avatar_url && <AvatarImage src={c.participant.avatar_url} />}
                            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                              {initials(c.participant.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span
                            className={cn(
                              "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                              isDeactivated ? "bg-muted-foreground" : "bg-emerald-500",
                            )}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-sm font-semibold">{c.participant.full_name}</span>
                            {c.lastMessage && (
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                {formatMessageTime(c.lastMessage.created_at)}
                              </span>
                            )}
                          </div>

                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <p className="truncate text-xs text-muted-foreground">
                              {c.lastMessage ? (
                                <>
                                  {c.lastMessage.sender_id === currentUser.id && (
                                    <span className="font-medium text-foreground">You: </span>
                                  )}
                                  {c.lastMessage.body}
                                </>
                              ) : (
                                <span className="italic">No messages yet</span>
                              )}
                            </p>

                            {c.unreadCount > 0 && (
                              <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                                {c.unreadCount > 99 ? "99+" : c.unreadCount}
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
        </aside>

        {/* ========================================================================= */}
        {/* RIGHT PANE: Chat Detail (Full screen on mobile when conversation selected) */}
        {/* ========================================================================= */}
        <main
          className={cn(
            "flex h-full flex-1 flex-col bg-background/50",
            !activeConvId ? "hidden lg:flex" : "flex",
          )}
        >
          {activeConvId && activeChatData ? (
            <>
              {/* Active Chat Header */}
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-4">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Mobile Back Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setActiveConvId(null)}
                    className="h-8 w-8 lg:hidden shrink-0"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>

                  <div className="relative">
                    <Avatar className="h-9 w-9">
                      {activeParticipant?.avatar_url && (
                        <AvatarImage src={activeParticipant.avatar_url} />
                      )}
                      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                        {initials(activeParticipant?.full_name ?? "User")}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      className={cn(
                        "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                        !activeParticipant?.is_active ? "bg-muted-foreground" : "bg-emerald-500",
                      )}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {activeParticipant?.full_name}
                      </p>
                      {activeParticipant?.role && (
                        <span className="hidden sm:inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {activeParticipant.role}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {!activeParticipant?.is_active ? (
                        <span className="text-destructive font-medium">Deactivated Account</span>
                      ) : (
                        activeParticipant?.job_title ?? "Active team member"
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="hidden sm:flex h-8 gap-1.5 text-xs text-muted-foreground"
                      >
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        <span>{retentionDays}-day retention</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 space-y-2 p-3.5 text-xs">
                      <p className="font-semibold text-foreground">Message retention</p>
                      <p className="text-muted-foreground leading-relaxed">
                        Team Chat messages are automatically deleted after {retentionDays} days.
                        <br />
                        Workspace retention is managed by the system administrator.
                      </p>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Deactivated user notice banner */}
              {!activeParticipant?.is_active && (
                <div className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive flex items-center gap-2">
                  <UserX className="h-4 w-4 shrink-0" />
                  <span>
                    This employee account is deactivated. Existing message history is preserved until its retention expiry, but new messages cannot be sent.
                  </span>
                </div>
              )}

              {/* View-As preview banner */}
              {isViewingAs && (
                <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                  <Shield className="h-4 w-4 shrink-0" />
                  <span>
                    You are in employee preview mode. Sending chat messages is disabled in read-only mode.
                  </span>
                </div>
              )}

              {/* Messages Scroll View */}
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {messagesLoading ? (
                  <div className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading messages…
                  </div>
                ) : messagesError ? (
                  <div className="p-4 text-center text-xs text-destructive">
                    Failed to load messages: {(messagesError as Error).message}
                  </div>
                ) : groupedMessages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
                    <div className="rounded-full bg-primary/10 p-3 text-primary mb-3">
                      <MessageSquare className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-medium text-foreground">No messages yet</p>
                    <p className="text-xs max-w-sm mt-1">
                      Say hello to {activeParticipant?.full_name}! Messages in this conversation are preserved for {retentionDays} days.
                    </p>
                  </div>
                ) : (
                  groupedMessages.map((group) => (
                    <div key={group.date} className="space-y-3">
                      {/* Date Divider */}
                      <div className="relative flex items-center justify-center">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-border/60" />
                        </div>
                        <span className="relative rounded-full border border-border/80 bg-card px-3 py-0.5 text-[10px] font-medium text-muted-foreground shadow-xs">
                          {group.date}
                        </span>
                      </div>

                      {/* Message list in this date group */}
                      <div className="space-y-2">
                        {group.messages.map((m) => {
                          const isMe = m.sender_id === currentUser.id;

                          return (
                            <div
                              key={m.id}
                              className={cn(
                                "flex flex-col max-w-[85%] sm:max-w-[70%]",
                                isMe ? "ml-auto items-end" : "mr-auto items-start",
                              )}
                            >
                              <div
                                className={cn(
                                  "rounded-2xl px-4 py-2 text-sm shadow-xs break-words",
                                  isMe
                                    ? "bg-primary text-primary-foreground rounded-br-xs"
                                    : "bg-muted text-foreground border border-border/50 rounded-bl-xs",
                                )}
                              >
                                <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                              </div>

                              <div className="mt-1 flex items-center gap-1 px-1 text-[10px] text-muted-foreground">
                                <span>{formatMessageTime(m.created_at)}</span>
                                {isMe && (
                                  <span>
                                    {m.is_read ? (
                                      <CheckCheck className="h-3 w-3 text-primary" />
                                    ) : (
                                      <Check className="h-3 w-3 text-muted-foreground" />
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer */}
              <div className="border-t border-border bg-card p-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-end gap-2"
                >
                  <Textarea
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      !activeParticipant?.is_active
                        ? "User is deactivated. Cannot send messages."
                        : isViewingAs
                          ? "Preview mode is read-only."
                          : "Type a message… (Enter to send, Shift+Enter for new line)"
                    }
                    disabled={
                      !activeParticipant?.is_active ||
                      isViewingAs ||
                      sendMutation.isPending
                    }
                    className="min-h-10 max-h-28 resize-none py-2 text-sm"
                    rows={1}
                  />

                  <Button
                    type="submit"
                    size="icon"
                    disabled={
                      !composerText.trim() ||
                      !activeParticipant?.is_active ||
                      isViewingAs ||
                      sendMutation.isPending
                    }
                    className="h-10 w-10 shrink-0"
                    aria-label="Send message"
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </div>
            </>
          ) : (
            /* Empty State when no conversation is selected (Desktop) */
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="rounded-full bg-primary/10 p-4 text-primary mb-3">
                <MessageSquare className="h-8 w-8" />
              </div>
              <h2 className="text-base font-semibold text-foreground">Bluetorn Team Chat</h2>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Select a conversation from the left to start chatting, or start a new 1:1 conversation with any team member.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setNewChatOpen(true)}
                className="mt-4 gap-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Start conversation</span>
              </Button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
