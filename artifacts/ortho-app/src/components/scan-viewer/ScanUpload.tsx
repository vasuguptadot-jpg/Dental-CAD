import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Upload, X, File as FileIcon, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ScanUploadProps {
  caseId: number;
  patientId: number;
  onSuccess: () => void;
}

export function ScanUpload({ caseId, patientId, onSuccess }: ScanUploadProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [jawType, setJawType] = useState<string>("Unknown");
  const [notes, setNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    // Validate size (max 200MB)
    if (selected.size > 200 * 1024 * 1024) {
      setError("File size exceeds 200MB limit.");
      return;
    }

    // Validate extension
    const name = selected.name.toLowerCase();
    if (!name.endsWith('.stl') && !name.endsWith('.obj') && !name.endsWith('.ply')) {
      setError("Only .stl, .obj, and .ply files are supported.");
      return;
    }

    setFile(selected);
    setError(null);
  };

  const handleUpload = () => {
    if (!file) {
      setError("Please select a file to upload.");
      return;
    }

    setIsUploading(true);
    setProgress(0);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("caseId", String(caseId));
    formData.append("patientId", String(patientId));
    formData.append("jawType", jawType);
    if (notes) formData.append("notes", notes);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/scans/upload");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = (event.loaded / event.total) * 100;
        setProgress(percentComplete);
      }
    };

    xhr.onload = () => {
      setIsUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        toast({
          title: "Upload successful",
          description: "Scan has been added to the case.",
        });
        setOpen(false);
        setFile(null);
        setNotes("");
        setJawType("Unknown");
        setProgress(0);
        onSuccess();
      } else {
        setError(`Upload failed: ${xhr.responseText || xhr.statusText}`);
        toast({
          title: "Upload failed",
          description: "There was an error uploading your scan.",
          variant: "destructive",
        });
      }
    };

    xhr.onerror = () => {
      setIsUploading(false);
      setError("Upload failed due to a network error.");
      toast({
        title: "Upload failed",
        description: "Network error occurred during upload.",
        variant: "destructive",
      });
    };

    xhr.send(formData);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-upload-scan">
          <Upload className="mr-2 h-4 w-4" />
          Upload Scan
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Upload 3D Scan</DialogTitle>
          <DialogDescription>
            Upload a dental scan file (.stl, .obj, .ply). Max size 200MB.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {!file ? (
            <div 
              className="border-2 border-dashed border-muted rounded-lg p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              data-testid="dropzone-scan-upload"
            >
              <Upload className="h-8 w-8 text-muted-foreground mb-4" />
              <p className="text-sm font-medium mb-1">Click to browse or drag file here</p>
              <p className="text-xs text-muted-foreground">Supported formats: STL, OBJ, PLY</p>
            </div>
          ) : (
            <div className="border rounded-lg p-4 flex items-center gap-4 bg-muted/20">
              <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                <FileIcon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" title={file.name}>{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
              </div>
              {!isUploading && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setFile(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
          
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".stl,.obj,.ply"
            onChange={handleFileChange}
          />

          <div className="space-y-2">
            <Label htmlFor="jawType">Jaw Type</Label>
            <Select value={jawType} onValueChange={setJawType} disabled={isUploading}>
              <SelectTrigger id="jawType">
                <SelectValue placeholder="Select jaw type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Upper Jaw">Upper Jaw</SelectItem>
                <SelectItem value="Lower Jaw">Lower Jaw</SelectItem>
                <SelectItem value="Full Arch">Full Arch</SelectItem>
                <SelectItem value="Unknown">Unknown / Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Clinical Notes (Optional)</Label>
            <Textarea 
              id="notes" 
              placeholder="Add any notes about this scan..." 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isUploading}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {isUploading && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Uploading...</span>
                <span className="text-muted-foreground">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button 
            variant="outline" 
            onClick={() => setOpen(false)}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleUpload} 
            disabled={!file || isUploading}
            data-testid="button-confirm-upload"
          >
            {isUploading ? "Uploading..." : "Upload Scan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
