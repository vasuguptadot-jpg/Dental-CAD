import { 
  useGetCase, 
  useUpdateCaseStatus, 
  useDeleteCase, 
  OrthoCaseStatus 
} from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/main-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Loader2, ArrowLeft, Trash2, CheckCircle2, User, FileText, AlignLeft } from "lucide-react";
import { getGetCaseQueryKey, getListCasesQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { StatusBadge, statusLabels } from "@/components/ui/status-badge";
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
import { useQueryClient } from "@tanstack/react-query";

const STATUS_ORDER: OrthoCaseStatus[] = [
  "new",
  "scan_uploaded",
  "analysis_completed",
  "treatment_planning",
  "approved",
  "manufacturing"
];

export default function CaseDetail({ params }: { params: { id: string } }) {
  const caseId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: orthoCase, isLoading } = useGetCase(caseId, {
    query: { enabled: !!caseId, queryKey: getGetCaseQueryKey(caseId) }
  });

  const deleteCase = useDeleteCase();
  const updateStatus = useUpdateCaseStatus();

  const handleDelete = () => {
    deleteCase.mutate({ id: caseId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCasesQueryKey() });
        if (orthoCase?.patientId) {
          setLocation(`/patients/${orthoCase.patientId}`);
        } else {
          setLocation("/cases");
        }
      }
    });
  };

  const handleStatusAdvance = (nextStatus: OrthoCaseStatus) => {
    updateStatus.mutate(
      { id: caseId, data: { status: nextStatus } },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetCaseQueryKey(caseId), data);
        }
      }
    );
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

  if (!orthoCase) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold">Case not found</h2>
          <Button variant="link" onClick={() => setLocation("/cases")} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Cases
          </Button>
        </div>
      </MainLayout>
    );
  }

  const currentStatusIndex = STATUS_ORDER.indexOf(orthoCase.status as OrthoCaseStatus);
  const nextStatus = currentStatusIndex < STATUS_ORDER.length - 1 ? STATUS_ORDER[currentStatusIndex + 1] : null;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{orthoCase.title || 'Untitled Case'}</h1>
              <StatusBadge status={orthoCase.status as OrthoCaseStatus} />
            </div>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              <span className="font-mono text-sm px-2 py-0.5 bg-muted rounded-md">{orthoCase.caseCode}</span>
              <span>•</span>
              <span>Created {format(new Date(orthoCase.createdAt), "MMMM d, yyyy")}</span>
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive hover:text-destructive-foreground">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this case record. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={deleteCase.isPending}
                  >
                    {deleteCase.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete Case"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            
            {nextStatus && (
              <Button 
                onClick={() => handleStatusAdvance(nextStatus)}
                disabled={updateStatus.isPending}
                className="bg-primary hover:bg-primary/90"
              >
                {updateStatus.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Advance to {statusLabels[nextStatus]}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle>Case Progression</CardTitle>
              <CardDescription>Track treatment lifecycle stages</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative border-l border-muted-foreground/30 ml-4 pl-8 py-2 space-y-12">
                {STATUS_ORDER.map((status, index) => {
                  const isCompleted = index < currentStatusIndex;
                  const isCurrent = index === currentStatusIndex;
                  const isPending = index > currentStatusIndex;

                  return (
                    <div key={status} className="relative">
                      {/* Timeline dot */}
                      <div className={`absolute -left-[41px] top-1 h-5 w-5 rounded-full border-2 bg-background flex items-center justify-center
                        ${isCompleted ? 'border-primary bg-primary' : ''}
                        ${isCurrent ? 'border-primary border-4 shadow-sm' : ''}
                        ${isPending ? 'border-muted-foreground/30' : ''}
                      `}>
                        {isCompleted && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      
                      <div>
                        <h4 className={`text-base font-semibold ${isPending ? 'text-muted-foreground' : 'text-foreground'}`}>
                          {statusLabels[status]}
                        </h4>
                        {isCurrent && (
                          <p className="text-sm text-muted-foreground mt-1">
                            Current active stage. {nextStatus ? `Ready to advance when complete.` : `Treatment plan finalized.`}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Patient Info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium leading-none">
                      <Link href={`/patients/${orthoCase.patientId}`} className="hover:underline">
                        {orthoCase.patientName || `Patient #${orthoCase.patientId}`}
                      </Link>
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">View patient details</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Clinical Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {orthoCase.description && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Description
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap pl-6">
                      {orthoCase.description}
                    </p>
                  </div>
                )}
                
                {orthoCase.notes ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <AlignLeft className="h-4 w-4 text-muted-foreground" />
                      Notes
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap pl-6">
                      {orthoCase.notes}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No clinical notes recorded.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
