import { useEffect, useRef, useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  Edit2,
  Info,
  Loader2,
  LogOut,
  MessageSquare,
  MoreVertical,
  Plus,
  Search,
  Send,
  Shield,
  Trash2,
  User,
  UserMinus,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/common/EmptyState";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  createChatGroup,
  getGroupMembers,
  addGroupMembers,
  removeGroupMember,
  leaveChatGroup,
  renameChatGroup,
  archiveChatGroup,
  restoreChatGroup,
  deleteChatGroup,
  listArchivedChatGroups,
  qk,
} from "@/lib/crm-api";
import type {
  ChatConversationSummary,
  ChatMessage,
  ChatParticipant,
  ChatConversationMember,
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
      { name: "description", content: "Direct and Group messaging across your workspace team." },
      { property: "og:title", content: "Team Chat · BLUETORN CRM" },
      { property: "og:description", content: "Direct and Group messaging across your workspace team." },
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
  const { user: currentUser, dbRole, isViewingAs } = useSession();

  const isOwner = dbRole === "owner" || dbRole === "super_admin";

  const [activeConvId, setActiveConvId] = useState<string | null>(searchParams.c ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [composerText, setComposerText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Modals state
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  const [newChatTab, setNewChatTab] = useState<"direct" | "group">("direct");
  const [manageMembersOpen, setManageMembersOpen] = useState(false);
  const [renameGroupOpen, setRenameGroupOpen] = useState(false);
  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false);
  const [archiveGroupOpen, setArchiveGroupOpen] = useState(false);
  const [showArchivedView, setShowArchivedView] = useState(false);

  // Create Group Form State
  const [groupTitle, setGroupTitle] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");

  // Rename Group Form State
  const [renameTitle, setRenameTitle] = useState("");
  const [renameDescription, setRenameDescription] = useState("");

  // Add Member to existing group Form State
  const [selectedNewMemberIds, setSelectedNewMemberIds] = useState<string[]>([]);

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

  // 3. Fetch available users for "New Chat" and "Add Member" modals
  const { data: availableUsers = [] } = useQuery({
    queryKey: qk.chatAvailableUsers(),
    queryFn: () => listAvailableChatUsers(),
    enabled: newChatModalOpen || manageMembersOpen,
  });

  // 4. Fetch group members if active conversation is a group
  const isCurrentGroup = activeChatData?.conversation?.type === "group";
  const { data: currentGroupMembers = [], refetch: refetchGroupMembers } = useQuery({
    queryKey: qk.chatGroupMembers(activeConvId ?? ""),
    queryFn: () => getGroupMembers(activeConvId!),
    enabled: Boolean(activeConvId) && isCurrentGroup && manageMembersOpen,
  });

  // 5. Fetch archived groups for Owner
  const { data: archivedGroups = [] } = useQuery({
    queryKey: qk.chatArchivedGroups(),
    queryFn: () => listArchivedChatGroups(),
    enabled: isOwner && showArchivedView,
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

  // Start new direct conversation mutation
  const startChatMutation = useMutation({
    mutationFn: (recipientId: string) =>
      sendChatMessage({
        recipientId,
        body: "Hello! Starting a new conversation.",
      }),
    onSuccess: (result) => {
      setNewChatModalOpen(false);
      queryClient.invalidateQueries({ queryKey: qk.chatConversations() });
      setActiveConvId(result.conversationId);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not start conversation.");
    },
  });

  // Create group mutation (Owner only)
  const createGroupMutation = useMutation({
    mutationFn: (data: { title: string; description?: string | undefined; memberIds: string[] }) =>
      createChatGroup(data),
    onSuccess: (result) => {
      toast.success(`Group "${result.title}" created successfully!`);
      setNewChatModalOpen(false);
      setGroupTitle("");
      setGroupDescription("");
      setSelectedMemberIds([]);
      queryClient.invalidateQueries({ queryKey: qk.chatConversations() });
      setActiveConvId(result.conversationId);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not create group.");
    },
  });

  // Add members mutation
  const addMembersMutation = useMutation({
    mutationFn: (userIds: string[]) =>
      addGroupMembers({ conversationId: activeConvId!, userIds }),
    onSuccess: (res) => {
      toast.success(`${res.addedCount} member(s) added successfully.`);
      setSelectedNewMemberIds([]);
      refetchGroupMembers();
      queryClient.invalidateQueries({ queryKey: qk.chatMessages(activeConvId!) });
      queryClient.invalidateQueries({ queryKey: qk.chatConversations() });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to add members.");
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: (targetUserId: string) =>
      removeGroupMember({ conversationId: activeConvId!, targetUserId }),
    onSuccess: () => {
      toast.success("Member removed from group.");
      refetchGroupMembers();
      queryClient.invalidateQueries({ queryKey: qk.chatMessages(activeConvId!) });
      queryClient.invalidateQueries({ queryKey: qk.chatConversations() });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to remove member.");
    },
  });

  // Leave group mutation (Employee)
  const leaveGroupMutation = useMutation({
    mutationFn: () => leaveChatGroup(activeConvId!),
    onSuccess: () => {
      toast.success("You have left the group.");
      setActiveConvId(null);
      queryClient.invalidateQueries({ queryKey: qk.chatConversations() });
      queryClient.invalidateQueries({ queryKey: qk.chatUnreadCount() });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to leave group.");
    },
  });

  // Rename group mutation
  const renameGroupMutation = useMutation({
    mutationFn: (data: { title: string; description?: string | undefined }) =>
      renameChatGroup({ conversationId: activeConvId!, ...data }),
    onSuccess: (res) => {
      toast.success(`Group renamed to "${res.title}".`);
      setRenameGroupOpen(false);
      queryClient.invalidateQueries({ queryKey: qk.chatMessages(activeConvId!) });
      queryClient.invalidateQueries({ queryKey: qk.chatConversations() });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to rename group.");
    },
  });

  // Archive group mutation
  const archiveGroupMutation = useMutation({
    mutationFn: () => archiveChatGroup(activeConvId!),
    onSuccess: () => {
      toast.success("Group archived.");
      setArchiveGroupOpen(false);
      setActiveConvId(null);
      queryClient.invalidateQueries({ queryKey: qk.chatConversations() });
      queryClient.invalidateQueries({ queryKey: qk.chatArchivedGroups() });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to archive group.");
    },
  });

  // Restore group mutation
  const restoreGroupMutation = useMutation({
    mutationFn: (convId: string) => restoreChatGroup(convId),
    onSuccess: () => {
      toast.success("Group restored to active.");
      queryClient.invalidateQueries({ queryKey: qk.chatConversations() });
      queryClient.invalidateQueries({ queryKey: qk.chatArchivedGroups() });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to restore group.");
    },
  });

  // Delete group mutation
  const deleteGroupMutation = useMutation({
    mutationFn: () => deleteChatGroup(activeConvId!),
    onSuccess: () => {
      toast.success("Group permanently deleted.");
      setDeleteGroupOpen(false);
      setActiveConvId(null);
      queryClient.invalidateQueries({ queryKey: qk.chatConversations() });
      queryClient.invalidateQueries({ queryKey: qk.chatArchivedGroups() });
      queryClient.invalidateQueries({ queryKey: qk.chatUnreadCount() });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete group.");
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
    return conversations.filter((c) => {
      const titleMatch = (c.title ?? "").toLowerCase().includes(q);
      const participantMatch = c.participant
        ? c.participant.full_name.toLowerCase().includes(q) ||
          c.participant.user_code.toLowerCase().includes(q)
        : false;
      const lastMsgMatch = c.lastMessage?.body
        ? c.lastMessage.body.toLowerCase().includes(q)
        : false;
      return titleMatch || participantMatch || lastMsgMatch;
    });
  }, [conversations, searchQuery]);

  // Split into Groups and Direct Messages
  const groupConversations = useMemo(
    () => filteredConversations.filter((c) => c.type === "group"),
    [filteredConversations],
  );

  const directConversations = useMemo(
    () => filteredConversations.filter((c) => c.type === "direct" || !c.type),
    [filteredConversations],
  );

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

  const activeConv = activeChatData?.conversation;
  const activeParticipant = activeChatData?.participant;
  const isGroupActive = activeConv?.type === "group";
  const isArchived = activeConv?.status === "archived";
  const retentionDays = activeChatData?.retentionDays ?? 15;
  const isGroupAdmin = isOwner || activeConv?.owner_id === currentUser.id;

  // Filter available users for Create Group
  const filteredAvailableForCreate = useMemo(() => {
    if (!memberSearchQuery.trim()) return availableUsers;
    const q = memberSearchQuery.toLowerCase();
    return availableUsers.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.user_code.toLowerCase().includes(q) ||
        (u.job_title ?? "").toLowerCase().includes(q),
    );
  }, [availableUsers, memberSearchQuery]);

  // Filter available users for Add to Existing Group
  const currentMemberIdSet = useMemo(
    () => new Set(currentGroupMembers.map((m) => m.user_id)),
    [currentGroupMembers],
  );
  const eligibleNewMembers = useMemo(
    () => availableUsers.filter((u) => !currentMemberIdSet.has(u.id) && u.is_active),
    [availableUsers, currentMemberIdSet],
  );

  const handleSelectAllEmployees = () => {
    if (selectedMemberIds.length === availableUsers.length) {
      setSelectedMemberIds([]);
    } else {
      setSelectedMemberIds(availableUsers.map((u) => u.id));
    }
  };

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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
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
              <Button
                size="sm"
                variant="default"
                onClick={() => {
                  setNewChatTab("direct");
                  setNewChatModalOpen(true);
                }}
                className="h-8 gap-1.5 px-2.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New chat</span>
              </Button>
            </div>
          </div>

          {/* Search bar */}
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search direct & groups…"
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
                      : "Start a 1:1 conversation or group chat."
                  }
                  action={
                    !searchQuery ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          setNewChatTab("direct");
                          setNewChatModalOpen(true);
                        }}
                        className="mt-2 text-xs"
                      >
                        Start new chat
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <div className="space-y-4 py-2">
                {/* 1. GROUPS SECTION */}
                {groupConversations.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between px-3.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        <span>Groups ({groupConversations.length})</span>
                      </span>
                    </div>

                    <ul className="divide-y divide-border/40">
                      {groupConversations.map((c) => {
                        const isActive = c.id === activeConvId;

                        return (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => setActiveConvId(c.id)}
                              className={cn(
                                "flex w-full items-start gap-3 p-3 text-left transition-colors",
                                isActive
                                  ? "bg-accent/80 text-accent-foreground"
                                  : "hover:bg-muted/50 text-foreground",
                              )}
                            >
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold">
                                <Users className="h-5 w-5" />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="truncate text-sm font-semibold">{c.title}</span>
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
                                        <span className="font-medium text-foreground">
                                          {c.lastMessage.sender_id === currentUser.id
                                            ? "You: "
                                            : c.lastMessage.sender_name
                                              ? `${c.lastMessage.sender_name}: `
                                              : ""}
                                        </span>
                                        {c.lastMessage.body}
                                      </>
                                    ) : (
                                      <span className="italic">No messages yet</span>
                                    )}
                                  </p>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {c.memberCount !== undefined && (
                                      <span className="text-[10px] text-muted-foreground font-medium">
                                        {c.memberCount}m
                                      </span>
                                    )}
                                    {c.unreadCount > 0 && (
                                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                                        {c.unreadCount > 99 ? "99+" : c.unreadCount}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* 2. DIRECT MESSAGES SECTION */}
                {directConversations.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between px-3.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span>Direct Messages ({directConversations.length})</span>
                      </span>
                    </div>

                    <ul className="divide-y divide-border/40">
                      {directConversations.map((c) => {
                        const isActive = c.id === activeConvId;
                        const isDeactivated = c.participant && !c.participant.is_active;

                        return (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => setActiveConvId(c.id)}
                              className={cn(
                                "flex w-full items-start gap-3 p-3 text-left transition-colors",
                                isActive
                                  ? "bg-accent/80 text-accent-foreground"
                                  : "hover:bg-muted/50 text-foreground",
                              )}
                            >
                              <div className="relative shrink-0">
                                <Avatar className="h-10 w-10">
                                  {c.participant?.avatar_url && (
                                    <AvatarImage src={c.participant.avatar_url} />
                                  )}
                                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                                    {initials(c.participant?.full_name ?? c.title ?? "User")}
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
                                  <span className="truncate text-sm font-semibold">
                                    {c.participant?.full_name ?? c.title}
                                  </span>
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
                  </div>
                )}

                {/* Owner Archived Groups View link */}
                {isOwner && (
                  <div className="px-3 pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowArchivedView(!showArchivedView)}
                      className="w-full justify-between text-xs text-muted-foreground hover:text-foreground"
                    >
                      <span className="flex items-center gap-1.5">
                        <Archive className="h-3.5 w-3.5" />
                        <span>Archived Groups ({archivedGroups.length})</span>
                      </span>
                      <span>{showArchivedView ? "Hide" : "Show"}</span>
                    </Button>

                    {showArchivedView && (
                      <div className="mt-2 space-y-1.5 rounded-lg border border-border/80 bg-muted/20 p-2">
                        {archivedGroups.length === 0 ? (
                          <p className="p-2 text-center text-[11px] text-muted-foreground">
                            No archived groups.
                          </p>
                        ) : (
                          archivedGroups.map((ag) => (
                            <div
                              key={ag.id}
                              className="flex items-center justify-between rounded p-1.5 text-xs hover:bg-card"
                            >
                              <span className="truncate font-medium">{ag.title}</span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => restoreGroupMutation.mutate(ag.id)}
                                disabled={restoreGroupMutation.isPending}
                                className="h-6 gap-1 px-2 text-[10px]"
                              >
                                <ArchiveRestore className="h-3 w-3" />
                                <span>Restore</span>
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
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

                  {isGroupActive ? (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold">
                      <Users className="h-5 w-5" />
                    </div>
                  ) : (
                    <div className="relative shrink-0">
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
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {isGroupActive ? activeConv?.title : activeParticipant?.full_name}
                      </p>
                      {isGroupActive ? (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          Group
                        </span>
                      ) : (
                        activeParticipant?.role && (
                          <span className="hidden sm:inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {activeParticipant.role}
                          </span>
                        )
                      )}
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {isGroupActive
                        ? `${activeChatData.memberCount ?? 0} members · ${
                            activeConv?.description || "Workspace group"
                          }`
                        : !activeParticipant?.is_active
                          ? "Deactivated Account"
                          : activeParticipant?.job_title ?? "Active team member"}
                    </p>
                  </div>
                </div>

                {/* Header Action Menu */}
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

                  {/* Group Action Menu */}
                  {isGroupActive && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">Group options</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 text-xs">
                        {isGroupAdmin ? (
                          <>
                            <DropdownMenuItem
                              onClick={() => {
                                setManageMembersOpen(true);
                              }}
                              className="gap-2 cursor-pointer"
                            >
                              <Users className="h-3.5 w-3.5" />
                              <span>Manage Members</span>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => {
                                setRenameTitle(activeConv?.title ?? "");
                                setRenameDescription(activeConv?.description ?? "");
                                setRenameGroupOpen(true);
                              }}
                              className="gap-2 cursor-pointer"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                              <span>Rename Group</span>
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              onClick={() => setArchiveGroupOpen(true)}
                              className="gap-2 cursor-pointer text-amber-600 focus:text-amber-600"
                            >
                              <Archive className="h-3.5 w-3.5" />
                              <span>Archive Group</span>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => setDeleteGroupOpen(true)}
                              className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Delete Group</span>
                            </DropdownMenuItem>
                          </>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => leaveGroupMutation.mutate()}
                            disabled={leaveGroupMutation.isPending}
                            className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                          >
                            <LogOut className="h-3.5 w-3.5" />
                            <span>Leave Group</span>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>

              {/* Deactivated user notice banner (Direct) */}
              {!isGroupActive && !activeParticipant?.is_active && (
                <div className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive flex items-center gap-2">
                  <UserX className="h-4 w-4 shrink-0" />
                  <span>
                    This employee account is deactivated. Existing message history is preserved until its retention expiry, but new messages cannot be sent.
                  </span>
                </div>
              )}

              {/* Archived group notice banner */}
              {isGroupActive && isArchived && (
                <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                  <Archive className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    This group is archived. Historical messages are preserved until retention expiry, but new messages cannot be sent.
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
                      {isGroupActive ? (
                        <Users className="h-6 w-6" />
                      ) : (
                        <MessageSquare className="h-6 w-6" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground">No messages yet</p>
                    <p className="text-xs max-w-sm mt-1">
                      {isGroupActive
                        ? `Welcome to #${activeConv?.title}! Messages are preserved for ${retentionDays} days.`
                        : `Say hello to ${activeParticipant?.full_name}! Messages are preserved for ${retentionDays} days.`}
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
                      <div className="space-y-3">
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
                              {/* In group chats, show sender's name above message for incoming bubbles */}
                              {isGroupActive && !isMe && (
                                <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-medium text-muted-foreground">
                                  <Avatar className="h-4 w-4">
                                    {m.sender_avatar && <AvatarImage src={m.sender_avatar} />}
                                    <AvatarFallback className="bg-primary/10 text-[8px] font-bold text-primary">
                                      {initials(m.sender_name ?? "User")}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span>{m.sender_name ?? m.sender_code ?? "Colleague"}</span>
                                  {m.sender_is_active === false && (
                                    <span className="text-[9px] text-destructive font-semibold">
                                      (Inactive)
                                    </span>
                                  )}
                                  {m.sender_id === activeConv?.owner_id && (
                                    <span className="rounded bg-primary/10 px-1 text-[9px] font-semibold text-primary">
                                      Owner
                                    </span>
                                  )}
                                </div>
                              )}

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
                      isArchived
                        ? "This group is archived. Messages cannot be sent."
                        : !isGroupActive && !activeParticipant?.is_active
                          ? "User is deactivated. Cannot send messages."
                          : isViewingAs
                            ? "Preview mode is read-only."
                            : isGroupActive
                              ? `Message #${activeConv?.title}… (Enter to send)`
                              : `Message ${activeParticipant?.full_name}… (Enter to send)`
                    }
                    disabled={
                      isArchived ||
                      (!isGroupActive && !activeParticipant?.is_active) ||
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
                      isArchived ||
                      (!isGroupActive && !activeParticipant?.is_active) ||
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
                Select a conversation from the left to start chatting, or start a new direct or group conversation.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setNewChatTab("direct");
                  setNewChatModalOpen(true);
                }}
                className="mt-4 gap-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Start conversation</span>
              </Button>
            </div>
          )}
        </main>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: NEW CHAT MODAL (Direct for everyone, Group for Owner) */}
      {/* ========================================================================= */}
      <Dialog open={newChatModalOpen} onOpenChange={setNewChatModalOpen}>
        <DialogContent className="sm:max-w-md w-full max-h-[85vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle>New Conversation</DialogTitle>
            <DialogDescription>
              {isOwner
                ? "Start a direct 1:1 message with a colleague or create a team group chat."
                : "Select an active team member from your workspace to message."}
            </DialogDescription>
          </DialogHeader>

          {isOwner ? (
            <Tabs
              value={newChatTab}
              onValueChange={(v) => setNewChatTab(v as any)}
              className="mt-2 flex-1 flex flex-col overflow-hidden"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="direct" className="gap-1.5 text-xs">
                  <User className="h-3.5 w-3.5" />
                  <span>Direct Message</span>
                </TabsTrigger>
                <TabsTrigger value="group" className="gap-1.5 text-xs">
                  <Users className="h-3.5 w-3.5" />
                  <span>Group Chat</span>
                </TabsTrigger>
              </TabsList>

              {/* Tab 1: Direct Message */}
              <TabsContent value="direct" className="mt-3 flex-1 overflow-y-auto space-y-2">
                <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
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
                          const existing = conversations.find(
                            (c) => c.type === "direct" && c.participant?.id === u.id,
                          );
                          if (existing) {
                            setNewChatModalOpen(false);
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
              </TabsContent>

              {/* Tab 2: Group Chat (Owner Only) */}
              <TabsContent value="group" className="mt-3 flex-1 overflow-y-auto space-y-3.5 pr-1">
                <div>
                  <label className="text-xs font-semibold text-foreground">
                    Group Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. Sales Team, Marketing, Documentation"
                    value={groupTitle}
                    onChange={(e) => setGroupTitle(e.target.value)}
                    className="mt-1 text-xs"
                    maxLength={100}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground">
                    Description <span className="text-muted-foreground font-normal">(Optional)</span>
                  </label>
                  <Textarea
                    placeholder="Purpose or topic of this group chat"
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
                    className="mt-1 resize-none text-xs"
                    rows={2}
                    maxLength={500}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between pb-1">
                    <label className="text-xs font-semibold text-foreground">
                      Select Members ({selectedMemberIds.length})
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleSelectAllEmployees}
                      className="h-6 px-1.5 text-[11px] text-primary"
                    >
                      {selectedMemberIds.length === availableUsers.length
                        ? "Deselect All"
                        : "Select All Employees"}
                    </Button>
                  </div>

                  <div className="max-h-40 overflow-y-auto rounded-lg border border-border/70 p-2 space-y-1">
                    {/* Owner is always included */}
                    <div className="flex items-center gap-2 rounded p-1.5 text-xs bg-muted/40">
                      <Checkbox checked disabled className="opacity-70" />
                      <div className="flex-1 truncate">
                        <span className="font-semibold">{currentUser.name}</span>
                        <span className="ml-1 text-[10px] text-primary font-medium">(Owner / You)</span>
                      </div>
                    </div>

                    {availableUsers.map((u) => {
                      const isSelected = selectedMemberIds.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-xs transition-colors hover:bg-accent"
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedMemberIds([...selectedMemberIds, u.id]);
                              } else {
                                setSelectedMemberIds(selectedMemberIds.filter((id) => id !== u.id));
                              }
                            }}
                          />
                          <div className="flex-1 truncate">
                            <span className="font-medium text-foreground">{u.full_name}</span>
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              ({u.job_title ?? u.role ?? u.user_code})
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setNewChatModalOpen(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!groupTitle.trim() || createGroupMutation.isPending}
                    onClick={() => {
                      createGroupMutation.mutate({
                        title: groupTitle.trim(),
                        description: groupDescription.trim() || undefined,
                        memberIds: selectedMemberIds,
                      });
                    }}
                    className="gap-1.5 text-xs"
                  >
                    {createGroupMutation.isPending && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    <span>Create Group</span>
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            /* Employee Direct Message view only */
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
                      const existing = conversations.find(
                        (c) => c.type === "direct" && c.participant?.id === u.id,
                      );
                      if (existing) {
                        setNewChatModalOpen(false);
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
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 2: MANAGE MEMBERS MODAL (Owner Only) */}
      {/* ========================================================================= */}
      <Dialog open={manageMembersOpen} onOpenChange={setManageMembersOpen}>
        <DialogContent className="sm:max-w-md w-full max-h-[85vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle>Manage Group Members</DialogTitle>
            <DialogDescription>
              View current members or add new colleagues to #{activeConv?.title}.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-4 overflow-y-auto pr-1">
            {/* Current Members Section */}
            <div>
              <h3 className="text-xs font-semibold text-foreground mb-2">
                Current Members ({currentGroupMembers.length})
              </h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-lg border border-border/70 p-2">
                {currentGroupMembers.map((m) => {
                  const isGroupOwner = m.user_id === activeConv?.owner_id;
                  const isDeactivated = !m.is_active;

                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-2 rounded-lg p-1.5 text-xs hover:bg-accent/40"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar className="h-7 w-7">
                          {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                          <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                            {initials(m.full_name ?? "User")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">
                            {m.full_name}
                            {m.user_id === currentUser.id && " (You)"}
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {isDeactivated ? (
                              <span className="text-destructive font-semibold">Deactivated</span>
                            ) : (
                              m.job_title ?? m.user_code
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isGroupOwner ? (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            Owner
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeMemberMutation.mutate(m.user_id)}
                            disabled={removeMemberMutation.isPending}
                            className="h-6 px-2 text-[10px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <UserMinus className="h-3 w-3 mr-1" />
                            <span>Remove</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Add New Members Section */}
            <div>
              <h3 className="text-xs font-semibold text-foreground mb-1.5">
                Add Team Members ({eligibleNewMembers.length} available)
              </h3>
              {eligibleNewMembers.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/70 p-3 text-center text-xs text-muted-foreground">
                  All active workspace team members are already in this group.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="max-h-36 overflow-y-auto rounded-lg border border-border/70 p-2 space-y-1">
                    {eligibleNewMembers.map((u) => {
                      const isSelected = selectedNewMemberIds.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-xs transition-colors hover:bg-accent"
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedNewMemberIds([...selectedNewMemberIds, u.id]);
                              } else {
                                setSelectedNewMemberIds(
                                  selectedNewMemberIds.filter((id) => id !== u.id),
                                );
                              }
                            }}
                          />
                          <div className="flex-1 truncate">
                            <span className="font-medium text-foreground">{u.full_name}</span>
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              ({u.job_title ?? u.role ?? u.user_code})
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        selectedNewMemberIds.length === 0 || addMembersMutation.isPending
                      }
                      onClick={() => addMembersMutation.mutate(selectedNewMemberIds)}
                      className="gap-1.5 text-xs"
                    >
                      {addMembersMutation.isPending && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Add Selected ({selectedNewMemberIds.length})</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setManageMembersOpen(false)}
              className="text-xs"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 3: RENAME GROUP MODAL (Owner Only) */}
      {/* ========================================================================= */}
      <Dialog open={renameGroupOpen} onOpenChange={setRenameGroupOpen}>
        <DialogContent className="sm:max-w-md w-full p-6">
          <DialogHeader>
            <DialogTitle>Rename Group</DialogTitle>
            <DialogDescription>Change the title or description for this group.</DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-3">
            <div>
              <label className="text-xs font-semibold text-foreground">Group Name *</label>
              <Input
                type="text"
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                className="mt-1 text-xs"
                maxLength={100}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground">
                Description (Optional)
              </label>
              <Textarea
                value={renameDescription}
                onChange={(e) => setRenameDescription(e.target.value)}
                className="mt-1 resize-none text-xs"
                rows={2}
                maxLength={500}
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRenameGroupOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!renameTitle.trim() || renameGroupMutation.isPending}
              onClick={() =>
                renameGroupMutation.mutate({
                  title: renameTitle.trim(),
                  description: renameDescription.trim() || undefined,
                })
              }
              className="gap-1.5 text-xs"
            >
              {renameGroupMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Save Changes</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 4: ARCHIVE GROUP ALERT (Owner Only) */}
      {/* ========================================================================= */}
      <AlertDialog open={archiveGroupOpen} onOpenChange={setArchiveGroupOpen}>
        <AlertDialogContent className="sm:max-w-md w-full">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive #{activeConv?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              Archiving hides this group from active conversations and prevents new messages from being sent.
              Existing messages remain preserved until their scheduled retention expiry. You can restore this group at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiveGroupMutation.mutate()}
              className="bg-amber-600 text-white hover:bg-amber-700 text-xs"
            >
              Archive Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ========================================================================= */}
      {/* MODAL 5: DELETE GROUP ALERT (Owner Only) */}
      {/* ========================================================================= */}
      <AlertDialog open={deleteGroupOpen} onOpenChange={setDeleteGroupOpen}>
        <AlertDialogContent className="sm:max-w-md w-full">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Permanently Delete #{activeConv?.title}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action is permanent and cannot be undone. All messages, membership records, and thread history for this group will be deleted from MySQL immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteGroupMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs"
            >
              Delete Group Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
