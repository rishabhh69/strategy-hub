import { useState, useEffect, useRef } from "react";
import { Send, Lock, Shield, User, AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MainLayout } from "@/components/layout/MainLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type CommunityMessage = Tables<"community_messages"> & {
  profiles?: {
    username: string | null;
    avatar_url: string | null;
  };
  user_roles?: {
    role: "admin" | "retail" | "sebi_verified";
  };
};

interface EnrichedMessage extends CommunityMessage {
  userName: string;
  userAvatar: string | null;
  isSebiVerified: boolean;
}

function ChatMessage({ message }: { message: EnrichedMessage }) {
  const borderClass = message.isSebiVerified 
    ? "border-l-4 border-l-yellow-500 bg-yellow-50/20 dark:bg-yellow-900/10" 
    : "border-b border-border/50";
  
  const formattedTime = new Date(message.created_at).toLocaleTimeString('en-IN', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  return (
    <div className={`flex gap-3 py-3 pl-3 ${borderClass} last:border-0`}>
      <Avatar className="w-8 h-8 flex-shrink-0">
        {message.userAvatar && <AvatarImage src={message.userAvatar} alt={message.userName} />}
        <AvatarFallback className="bg-muted text-xs">
          {message.userName.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-sm font-medium text-foreground">{message.userName}</span>
          {message.isSebiVerified && (
            <Badge className="bg-yellow-500 text-white text-[10px] px-2 py-0 flex items-center gap-1">
              <Shield className="w-3 h-3" />
              SEBI Verified
            </Badge>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {formattedTime}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{message.content}</p>
      </div>
    </div>
  );
}

function ChatInput({ 
  disabled, 
  placeholder,
  channel,
  onSendMessage,
  isSending = false,
}: { 
  disabled?: boolean; 
  placeholder?: string;
  channel: string;
  onSendMessage: (message: string, channel: string) => Promise<void>;
  isSending?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!message.trim()) return;
    
    try {
      setError(null);
      await onSendMessage(message, channel);
      setMessage("");
    } catch (err) {
      setError((err as Error).message || "Failed to send message");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {error && (
        <Alert variant="destructive" className="mx-4 mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2 p-4 border-t border-border bg-card">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Type your message..."}
          disabled={disabled || isSending}
          className="flex-1 bg-background border-border"
        />
        <Button 
          disabled={disabled || !message.trim() || isSending} 
          size="icon"
          onClick={handleSend}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </>
  );
}

export default function Community() {
  const [generalMessages, setGeneralMessages] = useState<EnrichedMessage[]>([]);
  const [expertMessages, setExpertMessages] = useState<EnrichedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<"admin" | "retail" | "sebi_verified" | null>(null);
  const [canPostInExpert, setCanPostInExpert] = useState(false);
  const generalScrollRef = useRef<HTMLDivElement>(null);
  const expertScrollRef = useRef<HTMLDivElement>(null);

  // Initialize user and fetch initial data
  useEffect(() => {
    const initializeUser = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          setLoading(false);
          return;
        }

        setCurrentUser(user);

        // Fetch user role
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .single();

        const role = roleData?.role || "retail";
        setUserRole(role as "admin" | "retail" | "sebi_verified");
        setCanPostInExpert(role === "sebi_verified" || role === "admin");

        // Fetch initial messages for both channels
        await fetchMessages("general", setGeneralMessages);
        await fetchMessages("expert", setExpertMessages);
      } catch (error) {
        console.error("Error initializing user:", error);
      } finally {
        setLoading(false);
      }
    };

    initializeUser();
  }, []);

  // Set up real-time subscriptions
  useEffect(() => {
    const subscriptionGeneral = supabase
      .channel("public:community_messages:channel=eq.general")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_messages",
          filter: "channel=eq.general",
        },
        async (payload) => {
          const newMessage = payload.new as CommunityMessage;
          const enrichedMessage = await enrichMessage(newMessage);
          setGeneralMessages((prev) => [...prev, enrichedMessage]);
          // Auto-scroll to bottom
          setTimeout(() => {
            if (generalScrollRef.current) {
              generalScrollRef.current.scrollTop = generalScrollRef.current.scrollHeight;
            }
          }, 0);
        }
      )
      .subscribe();

    const subscriptionExpert = supabase
      .channel("public:community_messages:channel=eq.expert")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_messages",
          filter: "channel=eq.expert",
        },
        async (payload) => {
          const newMessage = payload.new as CommunityMessage;
          const enrichedMessage = await enrichMessage(newMessage);
          setExpertMessages((prev) => [...prev, enrichedMessage]);
          // Auto-scroll to bottom
          setTimeout(() => {
            if (expertScrollRef.current) {
              expertScrollRef.current.scrollTop = expertScrollRef.current.scrollHeight;
            }
          }, 0);
        }
      )
      .subscribe();

    return () => {
      subscriptionGeneral.unsubscribe();
      subscriptionExpert.unsubscribe();
    };
  }, []);

  const fetchMessages = async (channel: string, setSetter: (messages: EnrichedMessage[]) => void) => {
    try {
      const { data, error } = await supabase
        .from("community_messages")
        .select("*")
        .eq("channel", channel)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Enrich each message with profile and role data
      const enriched = await Promise.all(
        (data || []).map((msg) => enrichMessage(msg))
      );

      setSetter(enriched);
    } catch (error) {
      console.error(`Error fetching ${channel} messages:`, error);
    }
  };

  const enrichMessage = async (message: CommunityMessage): Promise<EnrichedMessage> => {
    try {
      const [profileRes, roleRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("username, avatar_url")
          .eq("user_id", message.user_id)
          .single(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", message.user_id)
          .single(),
      ]);

      const userName = profileRes.data?.username || "Anonymous";
      const userAvatar = profileRes.data?.avatar_url || null;
      const isSebiVerified = roleRes.data?.role === "sebi_verified";

      return {
        ...message,
        userName,
        userAvatar,
        isSebiVerified,
      } as EnrichedMessage;
    } catch (error) {
      // User profile/role might not exist yet, return with defaults
      return {
        ...message,
        userName: "Anonymous",
        userAvatar: null,
        isSebiVerified: false,
      } as EnrichedMessage;
    }
  };

  const handleSendMessage = async (messageText: string, channel: string) => {
    if (!currentUser || !messageText.trim()) return;

    setIsSending(true);
    try {
      const { error } = await supabase.from("community_messages").insert({
        user_id: currentUser.id,
        content: messageText,
        channel: channel,
      });

      if (error) throw error;
    } catch (error) {
      console.error("Error sending message:", error);
      throw error;
    } finally {
      setIsSending(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="h-full flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </MainLayout>
    );
  }

  if (!currentUser) {
    return (
      <MainLayout>
        <div className="h-full flex flex-col items-center justify-center gap-4 p-4">
          <Lock className="w-12 h-12 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Sign in to Access Community</h1>
          <p className="text-muted-foreground text-center max-w-sm">
            Please log in to participate in the community forums
          </p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-border">
          <h1 className="text-xl font-semibold text-foreground">Community</h1>
          <p className="text-sm text-muted-foreground">Connect with traders and experts</p>
        </div>
        
        <Tabs defaultValue="general" className="flex-1 flex flex-col">
          <div className="px-4 pt-2 border-b border-border">
            <TabsList className="bg-transparent h-auto p-0 gap-4">
              <TabsTrigger 
                value="expert" 
                className="data-[state=active]:bg-muted data-[state=active]:text-foreground px-4 py-2 rounded-t-lg border-b-2 border-transparent data-[state=active]:border-yellow-500"
              >
                <Shield className="w-4 h-4 mr-2 text-yellow-500" />
                Expert Lounge
              </TabsTrigger>
              <TabsTrigger 
                value="general"
                className="data-[state=active]:bg-muted data-[state=active]:text-foreground px-4 py-2 rounded-t-lg border-b-2 border-transparent data-[state=active]:border-primary"
              >
                <User className="w-4 h-4 mr-2" />
                General Discussion
              </TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="expert" className="flex-1 flex flex-col m-0">
            {!canPostInExpert && (
              <Alert variant="default" className="m-4 border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/20">
                <Lock className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                <AlertDescription className="text-yellow-800 dark:text-yellow-300 ml-2">
                  🔒 Read-Only Mode. Only SEBI Registered Advisors can post here.
                </AlertDescription>
              </Alert>
            )}
            
            <ScrollArea className="flex-1" ref={expertScrollRef}>
              <div className="p-4 space-y-0">
                {expertMessages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No messages yet. Be the first to share!
                  </p>
                ) : (
                  expertMessages.map((message) => (
                    <ChatMessage key={message.id} message={message} />
                  ))
                )}
              </div>
            </ScrollArea>
            
            <ChatInput 
              disabled={!canPostInExpert}
              placeholder={canPostInExpert ? "Share your expert insights..." : "Read-only mode"}
              channel="expert"
              onSendMessage={handleSendMessage}
              isSending={isSending}
            />
          </TabsContent>
          
          <TabsContent value="general" className="flex-1 flex flex-col m-0">
            <ScrollArea className="flex-1" ref={generalScrollRef}>
              <div className="p-4 space-y-0">
                {generalMessages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No messages yet. Join the conversation!
                  </p>
                ) : (
                  generalMessages.map((message) => (
                    <ChatMessage key={message.id} message={message} />
                  ))
                )}
              </div>
            </ScrollArea>
            
            <ChatInput 
              channel="general"
              placeholder="Join the conversation..."
              onSendMessage={handleSendMessage}
              isSending={isSending}
            />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
