import { cn } from "@/lib/utils";

const FDI_LAYOUT = {
  upperRight: [18, 17, 16, 15, 14, 13, 12, 11],
  upperLeft: [21, 22, 23, 24, 25, 26, 27, 28],
  lowerLeft: [31, 32, 33, 34, 35, 36, 37, 38],
  lowerRight: [48, 47, 46, 45, 44, 43, 42, 41],
};

const FDI_NAMES: Record<number, string> = {
  11:"UR1",12:"UR2",13:"UR3",14:"UR4",15:"UR5",16:"UR6",17:"UR7",18:"UR8",
  21:"UL1",22:"UL2",23:"UL3",24:"UL4",25:"UL5",26:"UL6",27:"UL7",28:"UL8",
  31:"LL1",32:"LL2",33:"LL3",34:"LL4",35:"LL5",36:"LL6",37:"LL7",38:"LL8",
  41:"LR1",42:"LR2",43:"LR3",44:"LR4",45:"LR5",46:"LR6",47:"LR7",48:"LR8",
};

const TOOTH_TYPE: Record<number, string> = {
  11:"I",12:"I",13:"C",14:"P",15:"P",16:"M",17:"M",18:"W",
  21:"I",22:"I",23:"C",24:"P",25:"P",26:"M",27:"M",28:"W",
  31:"I",32:"I",33:"C",34:"P",35:"P",36:"M",37:"M",38:"W",
  41:"I",42:"I",43:"C",44:"P",45:"P",46:"M",47:"M",48:"W",
};

const TYPE_COLORS: Record<string, string> = {
  I: "bg-blue-500/15 border-blue-500/30 hover:bg-blue-500/30",
  C: "bg-amber-500/15 border-amber-500/30 hover:bg-amber-500/30",
  P: "bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/30",
  M: "bg-violet-500/15 border-violet-500/30 hover:bg-violet-500/30",
  W: "bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/25",
};

const SELECTED_CLASS = "ring-2 ring-primary bg-primary/20 border-primary";

interface ToothChartProps {
  selectedFdi: number | null;
  activeFdis?: number[];
  onSelect?: (fdi: number) => void;
  highlightedFdis?: Record<number, string>;
}

function ToothCell({
  fdi,
  selected,
  active,
  highlight,
  onSelect,
}: {
  fdi: number;
  selected: boolean;
  active: boolean;
  highlight?: string;
  onSelect?: (fdi: number) => void;
}) {
  const type = TOOTH_TYPE[fdi] ?? "I";
  const base = TYPE_COLORS[type] ?? "";

  return (
    <button
      title={`${fdi} — ${FDI_NAMES[fdi] ?? ""}`}
      onClick={() => onSelect?.(fdi)}
      className={cn(
        "relative flex flex-col items-center justify-center w-8 h-9 rounded border text-[10px] font-medium transition-all duration-150",
        selected ? SELECTED_CLASS : base,
        !active && !selected && "opacity-40",
        onSelect && "cursor-pointer",
        !onSelect && "cursor-default"
      )}
      style={highlight ? { borderColor: highlight, backgroundColor: `${highlight}22` } : undefined}
    >
      <span className={cn("leading-none font-bold", selected ? "text-primary" : "text-foreground/80")}>{fdi}</span>
      <span className="leading-none text-muted-foreground/60" style={{ fontSize: 8 }}>{type}</span>
      {selected && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary" />}
    </button>
  );
}

export function ToothChart({ selectedFdi, activeFdis, onSelect, highlightedFdis = {} }: ToothChartProps) {
  const isActive = (fdi: number) => !activeFdis || activeFdis.includes(fdi);

  return (
    <div className="select-none w-full">
      <div className="flex flex-col gap-1">
        {/* Upper arch */}
        <div className="flex justify-center gap-0.5">
          {FDI_LAYOUT.upperRight.map(fdi => (
            <ToothCell key={fdi} fdi={fdi} selected={selectedFdi === fdi} active={isActive(fdi)} highlight={highlightedFdis[fdi]} onSelect={onSelect} />
          ))}
          <div className="w-px bg-border mx-1" />
          {FDI_LAYOUT.upperLeft.map(fdi => (
            <ToothCell key={fdi} fdi={fdi} selected={selectedFdi === fdi} active={isActive(fdi)} highlight={highlightedFdis[fdi]} onSelect={onSelect} />
          ))}
        </div>

        {/* Midline */}
        <div className="flex justify-center items-center gap-2 py-0.5">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[9px] text-muted-foreground font-mono uppercase tracking-wider px-2">Occlusal</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Lower arch */}
        <div className="flex justify-center gap-0.5">
          {FDI_LAYOUT.lowerRight.slice().reverse().map(fdi => (
            <ToothCell key={fdi} fdi={fdi} selected={selectedFdi === fdi} active={isActive(fdi)} highlight={highlightedFdis[fdi]} onSelect={onSelect} />
          ))}
          <div className="w-px bg-border mx-1" />
          {FDI_LAYOUT.lowerLeft.map(fdi => (
            <ToothCell key={fdi} fdi={fdi} selected={selectedFdi === fdi} active={isActive(fdi)} highlight={highlightedFdis[fdi]} onSelect={onSelect} />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-3 mt-2 flex-wrap">
        {Object.entries({ I: "Incisor", C: "Canine", P: "Premolar", M: "Molar", W: "Wisdom" }).map(([k, label]) => (
          <div key={k} className="flex items-center gap-1">
            <span className={cn("w-3 h-3 rounded border inline-block", TYPE_COLORS[k])} />
            <span className="text-[9px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
