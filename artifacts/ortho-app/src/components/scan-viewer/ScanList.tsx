import { useListScans, useDeleteScan, getListScansQueryKey, type Scan } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Trash2, Box, FileBox, AlertCircle, Loader2 } from "lucide-react";
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

interface ScanListProps {
  caseId: number;
  patientId: number;
  selectedScanId?: number;
  onSelectScan: (scan: Scan) => void;
}

export function ScanList({ caseId, patientId, selectedScanId, onSelectScan }: ScanListProps) {
  const queryClient = useQueryClient();
  const { data: scansResponse, isLoading, error } = useListScans({ caseId }, {
    query: { enabled: !!caseId, queryKey: getListScansQueryKey({ caseId }) }
  });

  const deleteScan = useDeleteScan();

  const handleDelete = (id: number) => {
    deleteScan.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListScansQueryKey({ caseId }) });
      }
    });
  };

  const getJawTypeColor = (type: string) => {
    switch (type) {
      case "Upper Jaw": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "Lower Jaw": return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
      case "Full Arch": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      default: return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300";
    }
  };

  const getFileTypeColor = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case "stl": return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800";
      case "obj": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
      case "ply": return "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800";
      default: return "";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6 h-[120px] bg-muted/50" />
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center border rounded-lg bg-destructive/10 text-destructive flex flex-col items-center">
        <AlertCircle className="h-8 w-8 mb-2" />
        <p>Failed to load scans.</p>
      </div>
    );
  }

  const scans = scansResponse || [];

  if (scans.length === 0) {
    return (
      <div className="p-12 text-center border border-dashed rounded-lg bg-muted/30">
        <Box className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
        <h3 className="text-lg font-medium mb-2">No scans uploaded yet</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Upload 3D models (.stl, .obj, .ply) to analyze the patient's dental anatomy.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {scans.map((scan: Scan) => {
        const isSelected = selectedScanId === scan.id;
        const fileExt = scan.filename.split('.').pop()?.toUpperCase() || "3D";
        
        return (
          <Card 
            key={scan.id} 
            className={`cursor-pointer transition-all hover:border-primary/50 overflow-hidden ${
              isSelected ? "ring-2 ring-primary border-primary" : ""
            }`}
            onClick={() => onSelectScan(scan)}
            data-testid={`card-scan-${scan.id}`}
          >
            <CardContent className="p-0">
              <div className="p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 max-w-[80%]">
                    <Badge variant="outline" className={`font-mono text-[10px] uppercase px-1.5 ${getFileTypeColor(scan.filename)}`}>
                      {fileExt}
                    </Badge>
                    <span className="font-medium text-sm truncate" title={scan.filename}>
                      {scan.filename}
                    </span>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive -mt-1 -mr-2">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Scan</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this scan? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDelete(scan.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={deleteScan.isPending}
                          >
                            {deleteScan.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className={`border-transparent shadow-none font-medium ${getJawTypeColor(scan.jawType)}`}>
                    {scan.jawType}
                  </Badge>
                </div>

                <div className="flex items-center justify-between mt-2 pt-3 border-t text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileBox className="h-3 w-3" />
                    {formatFileSize(scan.fileSize)}
                  </span>
                  <span>{format(new Date(scan.createdAt), "MMM d, yyyy")}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
