import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Users, Activity, Loader2, X } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

interface SearchResult {
  patients: { id: number; patientCode: string; fullName: string; email: string }[];
  cases: { id: number; caseCode: string; title: string; status: string; patientId: number }[];
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_planning: "In Planning",
  under_review: "Under Review",
  approved: "Approved",
  active: "Active",
  completed: "Completed",
  new: "New",
  scan_uploaded: "Scan Uploaded",
  analysis_completed: "Analysis Completed",
  treatment_planning: "Treatment Planning",
  manufacturing: "Manufacturing",
};

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query, 250);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        setResults(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [debouncedQuery]);

  const navigate = useCallback((href: string) => {
    setOpen(false);
    setQuery("");
    setResults(null);
    setLocation(href);
  }, [setLocation]);

  const hasResults = results && (results.patients.length > 0 || results.cases.length > 0);
  const showDropdown = open && query.length >= 2;

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search… (Ctrl+K)"
          className="pl-8 pr-7 h-8 text-sm bg-muted/50 border-muted focus:bg-background"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setResults(null); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border rounded-lg shadow-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          ) : !hasResults ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No results for "{query}"</div>
          ) : (
            <div className="py-1 max-h-72 overflow-y-auto">
              {results!.patients.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="h-3 w-3" /> Patients
                  </div>
                  {results!.patients.map(p => (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/patients/${p.id}`)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted text-left"
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                        {p.fullName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.fullName}</p>
                        <p className="text-xs text-muted-foreground">{p.patientCode} · {p.email}</p>
                      </div>
                    </button>
                  ))}
                </>
              )}
              {results!.cases.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mt-1 border-t">
                    <Activity className="h-3 w-3" /> Cases
                  </div>
                  {results!.cases.map(c => (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/cases/${c.id}`)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted text-left"
                    >
                      <div className="w-7 h-7 rounded-full bg-violet-500/15 text-violet-400 flex items-center justify-center shrink-0">
                        <Activity className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{c.title}</p>
                        <p className="text-xs text-muted-foreground font-mono">{c.caseCode}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {STATUS_LABEL[c.status] ?? c.status}
                      </Badge>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
