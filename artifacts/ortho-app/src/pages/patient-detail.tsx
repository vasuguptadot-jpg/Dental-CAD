import { useGetPatient, useCreateCase, useDeletePatient, OrthoCaseStatus } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/main-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Loader2, ArrowLeft, Plus, Trash2, Calendar, Phone, Mail, MapPin, AlignLeft } from "lucide-react";
import { getGetPatientQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

const caseSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  notes: z.string().optional(),
});

type CaseFormValues = z.infer<typeof caseSchema>;

export default function PatientDetail({ params }: { params: { id: string } }) {
  const patientId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [isNewCaseOpen, setIsNewCaseOpen] = useState(false);

  const { data: patient, isLoading } = useGetPatient(patientId, {
    query: { enabled: !!patientId, queryKey: getGetPatientQueryKey(patientId) }
  });

  const deletePatient = useDeletePatient();
  const createCase = useCreateCase();

  const form = useForm<CaseFormValues>({
    resolver: zodResolver(caseSchema),
    defaultValues: {
      title: "",
      description: "",
      notes: "",
    },
  });

  const handleDelete = () => {
    deletePatient.mutate({ id: patientId }, {
      onSuccess: () => {
        setLocation("/patients");
      }
    });
  };

  const onSubmitCase = (data: CaseFormValues) => {
    createCase.mutate({
      data: {
        patientId,
        title: data.title,
        description: data.description,
        notes: data.notes
      }
    }, {
      onSuccess: () => {
        setIsNewCaseOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getGetPatientQueryKey(patientId) });
      }
    });
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!patient) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold">Patient not found</h2>
          <Button variant="link" onClick={() => setLocation("/patients")} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Patients
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => setLocation("/patients")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{patient.fullName}</h1>
              <span className="font-mono text-sm px-2 py-1 bg-muted text-muted-foreground rounded-md">
                {patient.patientCode}
              </span>
            </div>
            <p className="text-muted-foreground mt-1">
              Added {format(new Date(patient.createdAt), "MMMM d, yyyy")}
            </p>
          </div>
          <div className="ml-auto">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Patient
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete {patient.fullName}'s
                    record and all associated cases from the database.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={deletePatient.isPending}
                  >
                    {deletePatient.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete Patient"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Patient Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium leading-none">Age & Gender</p>
                  <p className="text-sm text-muted-foreground mt-1 capitalize">
                    {patient.age} years old, {patient.gender}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium leading-none">Phone</p>
                  <p className="text-sm text-muted-foreground mt-1">{patient.mobileNumber}</p>
                </div>
              </div>
              {patient.email && (
                <div className="flex items-start gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium leading-none">Email</p>
                    <p className="text-sm text-muted-foreground mt-1">{patient.email}</p>
                  </div>
                </div>
              )}
              {patient.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium leading-none">Address</p>
                    <p className="text-sm text-muted-foreground mt-1">{patient.address}</p>
                  </div>
                </div>
              )}
              {patient.notes && (
                <div className="flex items-start gap-3 pt-2 border-t">
                  <AlignLeft className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium leading-none">Clinical Notes</p>
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{patient.notes}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="col-span-2 flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle>Treatment Cases</CardTitle>
                <CardDescription>All clinical cases for this patient</CardDescription>
              </div>
              <Dialog open={isNewCaseOpen} onOpenChange={setIsNewCaseOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    New Case
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Case</DialogTitle>
                    <DialogDescription>
                      Start a new orthodontic treatment case for {patient.fullName}.
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmitCase)} className="space-y-4 pt-4">
                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Case Title *</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Upper aligner treatment" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Brief overview of the treatment goals..." 
                                className="resize-none" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Initial Clinical Notes</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Any specific clinical observations..." 
                                className="resize-none" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" className="w-full" disabled={createCase.isPending}>
                        {createCase.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Initialize Case
                      </Button>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Case ID</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right pr-6">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!patient.cases?.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                        No cases recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    patient.cases.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="pl-6 font-mono text-xs text-muted-foreground">
                          {c.caseCode}
                        </TableCell>
                        <TableCell className="font-medium">{c.title || 'Untitled Case'}</TableCell>
                        <TableCell>
                          <StatusBadge status={c.status as OrthoCaseStatus} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(c.createdAt), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <Link href={`/cases/${c.id}`}>
                            <Button variant="ghost" size="sm">Open</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
