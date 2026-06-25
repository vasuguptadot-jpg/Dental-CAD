import { Layout } from "@/components/layout";
import { ShieldAlert, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useRef } from "react";

export default function SecurityAnalyzer() {
  const [key, setKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const securityUrl = `${window.location.origin}/security-analyzer/`;

  return (
    <Layout>
      <div className="space-y-4 h-[calc(100vh-6rem)] flex flex-col">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-primary" />
              Security Analyzer
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Real-time vulnerability scanning and threat model analysis
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setKey(k => k + 1)}
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <a href={securityUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="h-4 w-4" /> Open Full View
              </Button>
            </a>
          </div>
        </div>

        <div className="flex-1 rounded-xl border overflow-hidden bg-background">
          <iframe
            key={key}
            ref={iframeRef}
            src={securityUrl}
            className="w-full h-full border-0"
            title="Security Analyzer"
            allow="same-origin"
          />
        </div>
      </div>
    </Layout>
  );
}
