import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Trash2, Bot, User, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { AiChatMessage } from "./types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const QUICK_PROMPTS = [
  "Suggest a treatment plan for this case",
  "Why would you move tooth 11?",
  "What causes crowding and how is it treated?",
  "Explain the risks of expansion treatment",
  "What appliances do you recommend?",
  "How long will treatment take?",
];

interface AIChatPanelProps {
  caseId: number;
  scanId?: number | null;
}

function MessageBubble({ msg }: { msg: AiChatMessage | { role: string; content: string; createdAt: string; id: number } }) {
  const isUser = msg.role === "user";

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
        isUser ? "bg-primary text-primary-foreground" : "bg-muted border border-border"
      )}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4 text-primary" />}
      </div>
      <div className={cn(
        "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
        isUser
          ? "bg-primary text-primary-foreground rounded-tr-sm"
          : "bg-muted border border-border/50 text-foreground rounded-tl-sm"
      )}>
        <p className="whitespace-pre-wrap">{msg.content}</p>
        <p className={cn("text-[10px] mt-1.5", isUser ? "text-primary-foreground/60 text-right" : "text-muted-foreground")}>
          {format(new Date(msg.createdAt), "HH:mm")}
        </p>
      </div>
    </div>
  );
}

export function AIChatPanel({ caseId, scanId }: AIChatPanelProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<(AiChatMessage | { role: string; content: string; createdAt: string; id: number })[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadHistory();
  }, [caseId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/ai/chat`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || streaming) return;

    setInput("");
    const userMsg = { id: Date.now(), role: "user", content: msg, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);
    setStreamingContent("");

    try {
      const res = await fetch(`/api/cases/${caseId}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: msg, scanId }),
      });

      if (!res.ok) throw new Error("Request failed");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "delta" && evt.content) {
              full += evt.content;
              setStreamingContent(full);
            } else if (evt.type === "done") {
              setMessages((prev) => [
                ...prev,
                { id: Date.now() + 1, role: "assistant", content: full, createdAt: new Date().toISOString() },
              ]);
              setStreamingContent("");
            } else if (evt.type === "error") {
              throw new Error(evt.message);
            }
          } catch {
            // skip parse errors
          }
        }
      }
    } catch {
      toast({ title: "Chat failed", description: "Could not reach the AI copilot.", variant: "destructive" });
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
    } finally {
      setStreaming(false);
      setStreamingContent("");
    }
  };

  const handleClear = async () => {
    try {
      await fetch(`/api/cases/${caseId}/ai/chat`, { method: "DELETE", credentials: "include" });
      setMessages([]);
    } catch {
      toast({ title: "Failed to clear chat", variant: "destructive" });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isEmpty = messages.length === 0 && !streaming;

  return (
    <div className="flex flex-col h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">AI Copilot Chat</p>
            <p className="text-xs text-muted-foreground">Ask anything about this case</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleClear} className="text-muted-foreground hover:text-destructive text-xs gap-1.5">
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {isEmpty && !loading && (
          <div className="flex flex-col items-center justify-center h-full py-8 space-y-4 text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Ask the AI Copilot</p>
              <p className="text-xs text-muted-foreground mt-1">Get evidence-based insights about this case</p>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
              {QUICK_PROMPTS.slice(0, 4).map((p) => (
                <button
                  key={p}
                  onClick={() => handleSend(p)}
                  className="text-left text-xs px-3 py-2 rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/60 hover:border-primary/30 transition-colors text-muted-foreground hover:text-foreground"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {streaming && streamingContent && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted border border-border">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed bg-muted border border-border/50">
              <p className="whitespace-pre-wrap">{streamingContent}</p>
              <span className="inline-block h-4 w-0.5 bg-primary animate-pulse ml-0.5 align-text-bottom" />
            </div>
          </div>
        )}

        {streaming && !streamingContent && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted border border-border">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-muted border border-border/50 flex items-center gap-2">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick prompts row */}
      {messages.length > 0 && (
        <div className="px-4 py-2 flex gap-2 overflow-x-auto border-t border-border/40">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => handleSend(p)}
              disabled={streaming}
              className="shrink-0 text-xs px-3 py-1.5 rounded-full border border-border/60 bg-muted/30 hover:bg-muted/60 hover:border-primary/30 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-border/60">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this case… (Enter to send, Shift+Enter for newline)"
            className="min-h-[60px] max-h-[120px] resize-none text-sm bg-muted/30"
            disabled={streaming}
          />
          <Button
            size="icon"
            onClick={() => handleSend()}
            disabled={!input.trim() || streaming}
            className="shrink-0 h-[60px] w-[60px]"
          >
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
