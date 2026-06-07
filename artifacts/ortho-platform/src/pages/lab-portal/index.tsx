import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  FlaskConical, Plus, Search, Package, Clock, CheckCircle2,
  AlertCircle, FileText, MessageSquare, ArrowUpRight, Building2,
  Loader2, Truck, XCircle, RefreshCw,
} from "lucide-react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type Lab = {
  id: number; name: string; contactName: string | null; email: string | null;
  phone: string | null; turnaroundDays: number; specialties: string[];
};

type LabOrder = {
  id: number; orderCode: string; labId: number; labName: string | null;
  caseId: number; patientName: string | null; caseCode: string | null;
  type: string; status: string; priority: string;
  dueDate: string | null; fileCount: number; messageCount: number; createdAt: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:       { label: "Draft",       color: "bg-muted text-muted-foreground",       icon: FileText },
  pending:     { label: "Pending",     color: "bg-yellow-500/20 text-yellow-400",      icon: Clock },
  in_progress: { label: "In Progress", color: "bg-blue-500/20 text-blue-400",          icon: RefreshCw },
  review:      { label: "Under Review",color: "bg-purple-500/20 text-purple-400",     icon: AlertCircle },
  completed:   { label: "Completed",   color: "bg-green-500/20 text-green-400",       icon: CheckCircle2 },
  shipped:     { label: "Shipped",     color: "bg-cyan-500/20 text-cyan-400",         icon: Truck },
  cancelled:   { label: "Cancelled",   color: "bg-red-500/20 text-red-400",           icon: XCircle },
};

const PRIORITY_COLOR: Record<string, string> = {
  normal: "bg-muted text-muted-foreground",
  urgent: "bg-orange-500/20 text-orange-400",
  stat:   "bg-red-500/20 text-red-400",
};

function useLabs() {
  return useQuery<{ labs: Lab[] }>({
    queryKey: ["labs"],
    queryFn: async () => {
      const r = await fetch(`/api/labs`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch labs");
      return r.json();
    },
  });
}

function useLabOrders(status?: string) {
  return useQuery<{ orders: LabOrder[]; total: number }>({
    queryKey: ["lab-orders", status],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (status && status !== "all") params.set("status", status);
      const r = await fetch(`/api/lab-orders?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch orders");
      return r.json();
    },
  });
}

export default function LabPortal() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddLab, setShowAddLab] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [labForm, setLabForm] = useState({ name: "", contactName: "", email: "", phone: "", turnaroundDays: "7" });
  const [orderForm, setOrderForm] = useState({ labId: "", caseId: "", type: "aligner", priority: "normal", instructions: "", dueDate: "" });

  const { data: labsData, isLoading: labsLoading } = useLabs();
  const { data: ordersData, isLoading: ordersLoading } = useLabOrders(statusFilter);
  const labs = labsData?.labs ?? [];
  const orders = ordersData?.orders ?? [];

  const createLab = useMutation({
    mutationFn: async (body: object) => {
      const r = await fetch(`/api/labs`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Failed to create lab");
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["labs"] }); setShowAddLab(false); toast({ title: "Lab added" }); },
    onError: () => toast({ title: "Error adding lab", variant: "destructive" }),
  });

  const createOrder = useMutation({
    mutationFn: async (body: object) => {
      const r = await fetch(`/api/lab-orders`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Failed to create order");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lab-orders"] });
      setShowNewOrder(false);
      toast({ title: "Lab order created" });
    },
    onError: () => toast({ title: "Error creating order", variant: "destructive" }),
  });

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    return !q || (o.orderCode.toLowerCase().includes(q) || (o.patientName ?? "").toLowerCase().includes(q) || (o.labName ?? "").toLowerCase().includes(q));
  });

  const statusCounts = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-primary" />
              Lab Portal
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Send cases to dental labs, track orders, and exchange files</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={showAddLab} onOpenChange={setShowAddLab}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Building2 className="h-4 w-4 mr-2" /> Add Lab
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Dental Lab</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-1">
                    <Label>Lab Name *</Label>
                    <Input value={labForm.name} onChange={e => setLabForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. PrecisionDent Lab" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Contact Name</Label>
                      <Input value={labForm.contactName} onChange={e => setLabForm(p => ({ ...p, contactName: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Email</Label>
                      <Input type="email" value={labForm.email} onChange={e => setLabForm(p => ({ ...p, email: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Phone</Label>
                      <Input value={labForm.phone} onChange={e => setLabForm(p => ({ ...p, phone: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Avg Turnaround (days)</Label>
                      <Input type="number" min="1" value={labForm.turnaroundDays} onChange={e => setLabForm(p => ({ ...p, turnaroundDays: e.target.value }))} />
                    </div>
                  </div>
                  <Button className="w-full" disabled={createLab.isPending} onClick={() => createLab.mutate({ ...labForm, turnaroundDays: parseInt(labForm.turnaroundDays) })}>
                    {createLab.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Lab"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={showNewOrder} onOpenChange={setShowNewOrder}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" /> New Order
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New Lab Order</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-1">
                    <Label>Lab *</Label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={orderForm.labId}
                      onChange={e => setOrderForm(p => ({ ...p, labId: e.target.value }))}
                    >
                      <option value="">Select a lab...</option>
                      {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Case ID *</Label>
                    <Input type="number" placeholder="Enter case ID" value={orderForm.caseId} onChange={e => setOrderForm(p => ({ ...p, caseId: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Type</Label>
                      <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={orderForm.type} onChange={e => setOrderForm(p => ({ ...p, type: e.target.value }))}>
                        <option value="aligner">Aligner</option>
                        <option value="retainer">Retainer</option>
                        <option value="model">Study Model</option>
                        <option value="appliance">Appliance</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>Priority</Label>
                      <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={orderForm.priority} onChange={e => setOrderForm(p => ({ ...p, priority: e.target.value }))}>
                        <option value="normal">Normal</option>
                        <option value="urgent">Urgent</option>
                        <option value="stat">STAT</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Due Date</Label>
                    <Input type="date" value={orderForm.dueDate} onChange={e => setOrderForm(p => ({ ...p, dueDate: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Instructions</Label>
                    <textarea
                      className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                      placeholder="Special instructions for the lab..."
                      value={orderForm.instructions}
                      onChange={e => setOrderForm(p => ({ ...p, instructions: e.target.value }))}
                    />
                  </div>
                  <Button
                    className="w-full"
                    disabled={createOrder.isPending || !orderForm.labId || !orderForm.caseId}
                    onClick={() => createOrder.mutate({
                      labId: parseInt(orderForm.labId),
                      caseId: parseInt(orderForm.caseId),
                      type: orderForm.type,
                      priority: orderForm.priority,
                      instructions: orderForm.instructions,
                      dueDate: orderForm.dueDate || undefined,
                    })}
                  >
                    {createOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send to Lab"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Orders", value: orders.length, icon: Package, color: "text-primary" },
            { label: "Pending", value: statusCounts.pending ?? 0, icon: Clock, color: "text-yellow-400" },
            { label: "In Progress", value: statusCounts.in_progress ?? 0, icon: RefreshCw, color: "text-blue-400" },
            { label: "Completed", value: statusCounts.completed ?? 0, icon: CheckCircle2, color: "text-green-400" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <s.icon className={`h-5 w-5 ${s.color}`} />
                <div>
                  <div className="text-xl font-bold">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Labs quick overview */}
        {labs.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Connected Labs</h2>
            <div className="flex flex-wrap gap-2">
              {labs.map(lab => (
                <div key={lab.id} className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm bg-card">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  <span className="font-medium">{lab.name}</span>
                  <span className="text-muted-foreground">· {lab.turnaroundDays}d avg</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1 flex-wrap">
            {["all", "pending", "in_progress", "review", "completed", "shipped"].map(s => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? "secondary" : "ghost"}
                onClick={() => setStatusFilter(s)}
                className="capitalize text-xs"
              >
                {s === "all" ? "All" : STATUS_CONFIG[s]?.label ?? s}
                {s !== "all" && statusCounts[s] ? (
                  <span className="ml-1.5 text-xs bg-primary/20 text-primary px-1 rounded-full">{statusCounts[s]}</span>
                ) : null}
              </Button>
            ))}
          </div>
        </div>

        {/* Orders list */}
        {ordersLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <FlaskConical className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">No lab orders yet</p>
              <p className="text-muted-foreground text-sm mt-1">
                {labs.length === 0 ? "Add a dental lab first, then create your first order." : "Click 'New Order' to send a case to a lab."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map(order => {
              const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.draft;
              const StatusIcon = cfg.icon;
              return (
                <Link key={order.id} href={`/lab-portal/${order.id}`}>
                  <Card className="cursor-pointer hover:border-primary/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-semibold text-sm">{order.orderCode}</span>
                            <Badge className={`text-xs px-2 py-0 ${cfg.color}`}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {cfg.label}
                            </Badge>
                            {order.priority !== "normal" && (
                              <Badge className={`text-xs px-2 py-0 ${PRIORITY_COLOR[order.priority]}`}>
                                {order.priority.toUpperCase()}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3.5 w-3.5" />
                              {order.labName ?? "Unknown Lab"}
                            </span>
                            {order.patientName && (
                              <span>{order.patientName}</span>
                            )}
                            {order.caseCode && (
                              <span className="font-mono text-xs">{order.caseCode}</span>
                            )}
                            <span className="capitalize">{order.type}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                          <span className="flex items-center gap-1">
                            <FileText className="h-3.5 w-3.5" />
                            {order.fileCount}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3.5 w-3.5" />
                            {order.messageCount}
                          </span>
                          {order.dueDate && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {new Date(order.dueDate).toLocaleDateString()}
                            </span>
                          )}
                          <ArrowUpRight className="h-4 w-4" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
