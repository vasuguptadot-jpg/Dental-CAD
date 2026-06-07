import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { 
  useGetPatient, 
  useUpdatePatient, 
  useListCases, 
  useCreateCase,
  getGetPatientQueryKey,
  getListCasesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Edit, Plus, FileText, Calendar, Phone, Mail, User } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const updatePatientSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  age: z.coerce.number().min(1, "Age is required"),
  gender: z.string().min(1, "Gender is required"),
  mobileNumber: z.string().min(5, "Mobile number is required"),
  email: z.string().email("Valid email is required"),
  address: z.string().optional(),
  notes: z.string().optional(),
});

const createCaseSchema = z.object({
  title: z.string().min(3, "Title is required"),
  notes: z.string().optional(),
});

const STATUS_COLORS: Record<string, string> = {
  "new": "bg-muted text-muted-foreground",
  "scan_uploaded": "bg-chart-4/20 text-chart-4",
  "analysis_completed": "bg-chart-3/20 text-chart-3",
  "treatment_planning": "bg-primary/20 text-primary",
  "approved": "bg-chart-2/20 text-chart-2",
  "manufacturing": "bg-chart-5/20 text-chart-5",
};

const formatStatus = (status: string) => {
  return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

export default function PatientDetail() {
  const [, params] = useRoute("/patients/:patientId");
  const patientId = params?.patientId ? parseInt(params.patientId, 10) : 0;
  
  const { data: patient, isLoading: patientLoading } = useGetPatient(patientId, {
    query: { enabled: !!patientId, queryKey: getGetPatientQueryKey(patientId) }
  });
  
  const { data: casesData, isLoading: casesLoading } = useListCases({ patientId }, {
    query: { enabled: !!patientId, queryKey: getListCasesQueryKey({ patientId }) }
  });

  if (patientLoading) {
    return (
      <Layout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!patient) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
          <h2 className="text-2xl font-bold">Patient not found</h2>
          <Link href="/patients">
            <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Patients</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <Link href="/patients">
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight">{patient.fullName}</h1>
                <Badge variant="outline" className="font-mono">{patient.patientCode}</Badge>
              </div>
              <p className="text-muted-foreground">Patient details and treatment history</p>
            </div>
          </div>
          <EditPatientDialog patient={patient} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Patient Info Card */}
          <Card className="md:col-span-1 h-fit">
            <CardHeader>
              <CardTitle className="text-lg">Demographics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="bg-muted p-2 rounded-md"><User className="h-4 w-4 text-muted-foreground" /></div>
                <div>
                  <p className="text-sm font-medium">Age / Gender</p>
                  <p className="text-sm text-muted-foreground">{patient.age} years, {patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-muted p-2 rounded-md"><Phone className="h-4 w-4 text-muted-foreground" /></div>
                <div>
                  <p className="text-sm font-medium">Mobile</p>
                  <p className="text-sm text-muted-foreground">{patient.mobileNumber}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-muted p-2 rounded-md"><Mail className="h-4 w-4 text-muted-foreground" /></div>
                <div>
                  <p className="text-sm font-medium">Email</p>
                  <p className="text-sm text-muted-foreground">{patient.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-muted p-2 rounded-md"><Calendar className="h-4 w-4 text-muted-foreground" /></div>
                <div>
                  <p className="text-sm font-medium">Registered</p>
                  <p className="text-sm text-muted-foreground">{new Date(patient.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              
              {patient.notes && (
                <div className="pt-4 border-t mt-4">
                  <p className="text-sm font-medium mb-1">Clinical Notes</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{patient.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cases List */}
          <Card className="md:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Treatment Cases</CardTitle>
                <CardDescription>All orthodontic cases for this patient</CardDescription>
              </div>
              <AddCaseDialog patientId={patient.id} />
            </CardHeader>
            <CardContent>
              {casesLoading ? (
                <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : casesData?.cases.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p>No cases initiated yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Case Code</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {casesData?.cases.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">{c.caseCode}</TableCell>
                        <TableCell className="font-medium">{c.title}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_COLORS[c.status]}>
                            {formatStatus(c.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/cases/${c.id}`}>
                            <Button variant="ghost" size="sm" className="text-primary hover:text-primary">
                              Open Case
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

function EditPatientDialog({ patient }: { patient: any }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updatePatient = useUpdatePatient();
  
  const form = useForm<z.infer<typeof updatePatientSchema>>({
    resolver: zodResolver(updatePatientSchema),
    defaultValues: {
      fullName: patient.fullName,
      age: patient.age,
      gender: patient.gender,
      mobileNumber: patient.mobileNumber,
      email: patient.email,
      address: patient.address || "",
      notes: patient.notes || "",
    },
  });

  const onSubmit = (values: z.infer<typeof updatePatientSchema>) => {
    updatePatient.mutate({ patientId: patient.id, data: values }, {
      onSuccess: () => {
        toast({ title: "Patient updated successfully" });
        queryClient.invalidateQueries({ queryKey: getGetPatientQueryKey(patient.id) });
        setOpen(false);
      },
      onError: (err) => {
        toast({ variant: "destructive", title: "Failed to update", description: (err as any)?.error || "An error occurred" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Edit className="h-4 w-4" /> Edit Details
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Patient</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField control={form.control} name="fullName" render={({ field }) => (
              <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="age" render={({ field }) => (
                <FormItem><FormLabel>Age</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="gender" render={({ field }) => (
                <FormItem>
                  <FormLabel>Gender</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="mobileNumber" render={({ field }) => (
              <FormItem><FormLabel>Mobile Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem><FormLabel>Email Address</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>Clinical Notes</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="pt-4 flex justify-end">
              <Button type="submit" disabled={updatePatient.isPending}>
                {updatePatient.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Changes
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AddCaseDialog({ patientId }: { patientId: number }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createCase = useCreateCase();
  
  const form = useForm<z.infer<typeof createCaseSchema>>({
    resolver: zodResolver(createCaseSchema),
    defaultValues: { title: "", notes: "" },
  });

  const onSubmit = (values: z.infer<typeof createCaseSchema>) => {
    createCase.mutate({ data: { ...values, patientId } }, {
      onSuccess: () => {
        toast({ title: "Case created successfully" });
        queryClient.invalidateQueries({ queryKey: getListCasesQueryKey({ patientId }) });
        form.reset();
        setOpen(false);
      },
      onError: (err) => {
        toast({ variant: "destructive", title: "Failed to create", description: (err as any)?.error });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> New Case</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Initiate New Case</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem><FormLabel>Case Title</FormLabel><FormControl><Input placeholder="e.g. Upper aligner phase 1" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>Initial Notes</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="pt-4 flex justify-end">
              <Button type="submit" disabled={createCase.isPending}>
                {createCase.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create Case
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
