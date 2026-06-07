import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Building2, Clock, CheckCircle2, FileText, MessageSquare,
  Upload, Download, Send, Loader2, Package, Truck, XCircle,
  RefreshCw, AlertCircle, User, Bot,
} from "lucide-react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";

type OrderDetail = {
  id: number; orderCode: string; labId: number; labName: string | null;
  caseId: number; patientName: string | null; caseCode: string | null;
  type: string; status: string; priority: string;
  dueDate: string | null; instructions: string | null; fileCount: number; messageCount: number;
  createdAt: string;
  files: Array<{ id: number; direction: string; originalName: string; fileType: string; fileSize: number; createdAt: string }>;
  messages: Array<{ id: number; senderType: string; senderName: string; content: string; createdAt: string }>;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:       { label: "Draft",        color: "bg-muted text-muted-foreground",     icon: FileText },
  pending:     { label: "Pending",      color: "bg-yellow-500/20 text-yellow-400",   icon: Clock },
  in_progress: { label: "In Progress",  color: "bg-blue-500/20 text-blue-400",       icon: RefreshCw },
  review:      { label: "Under Review", color: "bg-purple-500/20 text-purple-400",   icon: AlertCircle },
  completed:   { label: "Completed",    color: "bg-green-500/20 text-green-400",     icon: CheckCircle2 },
  shipped:     { label: "Shipped",      color: "bg-cyan-500/20 text-cyan-400",       icon: Truck },
  cancelled:   { label: "Cancelled",    color: "bg-red-500/20 text-red-400",         icon: XCircle },
};

const ALL_STATUSES = ["pending", "in_progress", "review", "completed", "shipped", "cancelled"];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: order, isLoading } = useQuery<OrderDetail>({
    queryKey: ["lab-order", orderId],
    queryFn: async () => {
      const r = await fetch(`/api/lab-orders/${orderId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
    enabled: !!orderId,
    refetchInterval: 15000,
  });

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const r = await fetch(`/api/lab-orders/${orderId}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lab-order", orderId] }); qc.invalidateQueries({ queryKey: ["lab-orders"] }); },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const r = await fetch(`/api/lab-orders/${orderId}/messages`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, senderType: "clinic", senderName: user?.name ?? "Doctor" }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { setMessage(""); qc.invalidateQueries({ queryKey: ["lab-order", orderId] }); },
    onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
  });

  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("direction", "outgoing");
      const r = await fetch(`/api/lab-orders/${orderId}/files`, {
        method: "POST", credentials: "include", body: fd,
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { toast({ title: "File uploaded" }); qc.invalidateQueries({ queryKey: ["lab-order", orderId] }); },
    onError: () => toast({ title: "Upload failed", variant: "destructive" }),
  });

  if (isLoading) {
    return <Layout><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></Layout>;
  }

  if (!order) {
    return <Layout><div className="text-center py-20 text-muted-foreground">Order not found</div></Layout>;
  }

  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
  const StatusIcon = cfg.icon;

  return (
    <Layout>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/lab-portal")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold font-mono">{order.orderCode}</h1>
              <Badge className={`${cfg.color}`}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {cfg.label}
              </Badge>
              {order.priority !== "normal" && (
                <Badge className="bg-orange-500/20 text-orange-400">{order.priority.toUpperCase()}</Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{order.labName}</span>
              {order.patientName && <span>{order.patientName}</span>}
              {order.caseCode && <span className="font-mono text-xs">{order.caseCode}</span>}
              <span className="capitalize">{order.type}</span>
              {order.dueDate && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Due {new Date(order.dueDate).toLocaleDateString()}</span>}
            </div>
          </div>

          {/* Status changer */}
          <div className="flex gap-1 flex-wrap justify-end">
            {ALL_STATUSES.filter(s => s !== order.status).slice(0, 3).map(s => {
              const c = STATUS_CONFIG[s];
              const Icon = c.icon;
              return (
                <Button key={s} variant="outline" size="sm" className="text-xs"
                  disabled={updateStatus.isPending}
                  onClick={() => updateStatus.mutate(s)}
                >
                  <Icon className="h-3 w-3 mr-1" />
                  {c.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left — Instructions + Files */}
          <div className="lg:col-span-2 space-y-4">
            {/* Instructions */}
            {order.instructions && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><FileText className="h-4 w-4" />Instructions</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{order.instructions}</p>
                </CardContent>
              </Card>
            )}

            {/* Files */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Files ({order.files.length})
                  </CardTitle>
                  <div>
                    <input
                      type="file"
                      ref={fileRef}
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) uploadFile.mutate(f);
                        e.target.value = "";
                      }}
                    />
                    <Button size="sm" variant="outline" disabled={uploadFile.isPending} onClick={() => fileRef.current?.click()}>
                      {uploadFile.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                      Upload
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {order.files.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    <Upload className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No files yet. Upload STL/OBJ files to send to the lab.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {order.files.map(f => (
                      <div key={f.id} className="flex items-center gap-3 p-2 rounded-md border bg-muted/30">
                        <FileText className={`h-4 w-4 shrink-0 ${f.direction === "incoming" ? "text-green-400" : "text-primary"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{f.originalName}</p>
                          <p className="text-xs text-muted-foreground">{formatBytes(f.fileSize)} · {f.direction === "incoming" ? "From lab" : "Sent to lab"} · {new Date(f.createdAt).toLocaleDateString()}</p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          onClick={() => window.open(`/api/lab-orders/${orderId}/files/${f.id}/download`, "_blank")}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right — Messaging */}
          <div>
            <Card className="flex flex-col h-full min-h-[400px]">
              <CardHeader className="pb-2 shrink-0">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Lab Communication
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 gap-3 min-h-0">
                <div className="flex-1 overflow-y-auto space-y-3 min-h-0 max-h-[300px] pr-1">
                  {order.messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center text-muted-foreground text-sm py-8">
                      <div>
                        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No messages yet
                      </div>
                    </div>
                  ) : order.messages.map(msg => (
                    <div key={msg.id} className={`flex gap-2 ${msg.senderType === "clinic" ? "flex-row-reverse" : "flex-row"}`}>
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${msg.senderType === "clinic" ? "bg-primary/20" : "bg-muted"}`}>
                        {msg.senderType === "clinic" ? <User className="h-3 w-3 text-primary" /> : <Bot className="h-3 w-3" />}
                      </div>
                      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${msg.senderType === "clinic" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        <p className="text-xs opacity-70 mb-0.5">{msg.senderName}</p>
                        <p>{msg.content}</p>
                        <p className="text-xs opacity-60 mt-0.5">{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Input
                    placeholder="Type a message..."
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey && message.trim()) {
                        e.preventDefault();
                        sendMessage.mutate(message.trim());
                      }
                    }}
                    className="text-sm"
                  />
                  <Button
                    size="icon"
                    disabled={!message.trim() || sendMessage.isPending}
                    onClick={() => sendMessage.mutate(message.trim())}
                  >
                    {sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
