import { useState } from "react";
import { Send, Lock, Shield, User } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MainLayout } from "@/components/layout/MainLayout";

interface Message {
  id: string;
  userId: string;
  userName: string;
  isSebiVerified: boolean;
  content: string;
  timestamp: Date;
}

const mockGeneralMessages: Message[] = [
  {
    id: "1",
    userId: "u1",
    userName: "Rahul K.",
    isSebiVerified: false,
    content: "Anyone else seeing the breakout in RELIANCE today? Looking strong above 2850.",
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
  },
  {
    id: "2",
    userId: "u2",
    userName: "Priya M.",
    isSebiVerified: false,
    content: "Yeah, volume is picking up. I'm watching for confirmation above the resistance.",
    timestamp: new Date(Date.now() - 1000 * 60 * 4),
  },
  {
    id: "3",
    userId: "u3",
    userName: "Arjun S.",
    isSebiVerified: false,
    content: "Be careful though, RSI is getting into overbought territory on the hourly chart.",
    timestamp: new Date(Date.now() - 1000 * 60 * 3),
  },
  {
    id: "4",
    userId: "u4",
    userName: "Sneha G.",
    isSebiVerified: false,
    content: "Good point! I'm setting a trailing stop at 1% below the current price just in case.",
    timestamp: new Date(Date.now() - 1000 * 60 * 2),
  },
  {
    id: "5",
    userId: "u5",
    userName: "Vikram R.",
    isSebiVerified: false,
    content: "The banking index is also showing strength. HDFCBANK and ICICIBANK both up nicely.",
    timestamp: new Date(Date.now() - 1000 * 60 * 1),
  },
];

const mockExpertMessages: Message[] = [
  {
    id: "e1",
    userId: "exp1",
    userName: "Rajesh Sharma, CFA",
    isSebiVerified: true,
    content: "Market breadth is improving. The advance-decline ratio is the best we've seen in 3 weeks.",
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
  },
  {
    id: "e2",
    userId: "exp2",
    userName: "Dr. Priya Patel",
    isSebiVerified: true,
    content: "FII flows turning positive again. This could signal a continuation of the current trend.",
    timestamp: new Date(Date.now() - 1000 * 60 * 20),
  },
  {
    id: "e3",
    userId: "exp3",
    userName: "Amit Kumar, RIA",
    isSebiVerified: true,
    content: "For those asking about sector rotation - we're seeing money move from IT to financials.",
    timestamp: new Date(Date.now() - 1000 * 60 * 10),
  },
];

function ChatMessage({ message }: { message: Message }) {
  return (
    <div className="flex gap-3 py-3 border-b border-border/50 last:border-0">
      <Avatar className="w-8 h-8 flex-shrink-0">
        <AvatarFallback className="bg-muted text-xs">
          {message.userName.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-foreground">{message.userName}</span>
          {message.isSebiVerified && (
            <Badge className="badge-gold text-[10px] px-1 py-0">
              <Shield className="w-2.5 h-2.5 mr-0.5" />
              SEBI
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {message.timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{message.content}</p>
      </div>
    </div>
  );
}

function ChatInput({ disabled, placeholder }: { disabled?: boolean; placeholder?: string }) {
  const [message, setMessage] = useState("");
  
  return (
    <div className="flex gap-2 p-4 border-t border-border bg-card">
      <Input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={placeholder || "Type your message..."}
        disabled={disabled}
        className="flex-1 bg-background border-border"
      />
      <Button disabled={disabled || !message.trim()} size="icon">
        <Send className="w-4 h-4" />
      </Button>
    </div>
  );
}

export default function Community() {
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
                className="data-[state=active]:bg-muted data-[state=active]:text-foreground px-4 py-2 rounded-t-lg border-b-2 border-transparent data-[state=active]:border-gold"
              >
                <Shield className="w-4 h-4 mr-2 text-gold" />
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
            {/* Expert Lounge Restriction Banner */}
            <div className="mx-4 mt-4 p-4 rounded-lg bg-gradient-to-r from-gold/10 to-gold/5 border border-gold/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center">
                  <Lock className="w-5 h-5 text-gold" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Posting Restricted</p>
                  <p className="text-xs text-muted-foreground">
                    Only SEBI Registered Investment Advisors can post in the Expert Lounge
                  </p>
                </div>
              </div>
            </div>
            
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-0">
                {mockExpertMessages.map((message) => (
                  <ChatMessage key={message.id} message={message} />
                ))}
              </div>
            </ScrollArea>
            
            <ChatInput 
              disabled={true} 
              placeholder="Only SEBI Registered Advisors can post here" 
            />
          </TabsContent>
          
          <TabsContent value="general" className="flex-1 flex flex-col m-0">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-0">
                {mockGeneralMessages.map((message) => (
                  <ChatMessage key={message.id} message={message} />
                ))}
              </div>
            </ScrollArea>
            
            <ChatInput placeholder="Join the conversation..." />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
