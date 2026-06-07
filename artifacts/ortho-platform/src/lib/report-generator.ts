import type { ToothSegment } from "./segmentation-engine";
import type { ToothLandmarks } from "./landmark-engine";
import type { MeasurementSet } from "./measurement-engine";

interface ReportData {
  scanFileName: string;
  patientName?: string;
  caseCode?: string;
  jawType: string;
  segments: ToothSegment[];
  allLandmarks: ToothLandmarks[];
  measurements: MeasurementSet;
  generatedAt: string;
}

export function generateReportHTML(data: ReportData): string {
  const { scanFileName, patientName, caseCode, jawType, segments, measurements, generatedAt } = data;

  const upperTeeth = segments.filter(s => s.fdiNumber >= 11 && s.fdiNumber <= 28).sort((a, b) => a.fdiNumber - b.fdiNumber);
  const lowerTeeth = segments.filter(s => s.fdiNumber >= 31 && s.fdiNumber <= 48).sort((a, b) => a.fdiNumber - b.fdiNumber);

  const fdiName: Record<number, string> = {
    11: "UR Central Incisor", 12: "UR Lateral Incisor", 13: "UR Canine",
    14: "UR 1st Premolar", 15: "UR 2nd Premolar", 16: "UR 1st Molar",
    17: "UR 2nd Molar", 18: "UR 3rd Molar",
    21: "UL Central Incisor", 22: "UL Lateral Incisor", 23: "UL Canine",
    24: "UL 1st Premolar", 25: "UL 2nd Premolar", 26: "UL 1st Molar",
    27: "UL 2nd Molar", 28: "UL 3rd Molar",
    31: "LL Central Incisor", 32: "LL Lateral Incisor", 33: "LL Canine",
    34: "LL 1st Premolar", 35: "LL 2nd Premolar", 36: "LL 1st Molar",
    37: "LL 2nd Molar", 38: "LL 3rd Molar",
    41: "LR Central Incisor", 42: "LR Lateral Incisor", 43: "LR Canine",
    44: "LR 1st Premolar", 45: "LR 2nd Premolar", 46: "LR 1st Molar",
    47: "LR 2nd Molar", 48: "LR 3rd Molar",
  };

  const toothRow = (t: ToothSegment) => {
    const tw = measurements.toothWidths.find(m => m.toothFdi === t.fdiNumber);
    return `
      <tr>
        <td><span class="fdi-dot" style="background:${t.color}"></span>${t.fdiNumber}</td>
        <td>${fdiName[t.fdiNumber] ?? "—"}</td>
        <td>${t.vertexCount.toLocaleString()}</td>
        <td>${tw ? `${tw.value} ${tw.unit}` : "—"}</td>
      </tr>`;
  };

  const measRow = (m: { label: string; value: number; unit: string }) =>
    `<tr><td>${m.label}</td><td class="val">${m.value} ${m.unit}</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OrthoVision — Dental Analysis Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1a2e; background: #fff; }
    .page { max-width: 900px; margin: 0 auto; padding: 40px; }
    
    header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0ea5e9; padding-bottom: 20px; margin-bottom: 30px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-icon { width: 44px; height: 44px; background: #0c1a2e; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #0ea5e9; font-size: 22px; font-weight: 900; }
    .brand-name { font-size: 22px; font-weight: 700; color: #0c1a2e; }
    .brand-sub { font-size: 11px; color: #64748b; letter-spacing: 0.05em; text-transform: uppercase; }
    .report-meta { text-align: right; font-size: 12px; color: #64748b; }
    .report-meta strong { display: block; font-size: 15px; color: #1a1a2e; margin-bottom: 4px; }
    
    .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 30px; }
    .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
    .info-card label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; display: block; margin-bottom: 4px; }
    .info-card strong { font-size: 15px; color: #1a1a2e; }
    
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 30px; }
    .stat-card { background: #0c1a2e; color: white; border-radius: 8px; padding: 16px; text-align: center; }
    .stat-card .num { font-size: 28px; font-weight: 700; color: #0ea5e9; }
    .stat-card .lbl { font-size: 11px; color: #94a3b8; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    
    section { margin-bottom: 30px; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: #0ea5e9; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 16px; }
    
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f1f5f9; text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; border-bottom: 2px solid #e2e8f0; }
    td { padding: 9px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    .val { font-weight: 600; font-variant-numeric: tabular-nums; }
    .fdi-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }
    
    .jaw-section { background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .jaw-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 12px; }
    
    footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; }
    
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .page { padding: 20px; } }
  </style>
</head>
<body>
<div class="page">
  <header>
    <div class="brand">
      <div class="brand-icon">OV</div>
      <div>
        <div class="brand-name">OrthoVision</div>
        <div class="brand-sub">Dental Analysis Report</div>
      </div>
    </div>
    <div class="report-meta">
      <strong>AI Segmentation Report</strong>
      Generated: ${new Date(generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}<br>
      Time: ${new Date(generatedAt).toLocaleTimeString()}
    </div>
  </header>

  <div class="info-grid">
    <div class="info-card">
      <label>Patient</label>
      <strong>${patientName ?? "—"}</strong>
    </div>
    <div class="info-card">
      <label>Case Code</label>
      <strong>${caseCode ?? "—"}</strong>
    </div>
    <div class="info-card">
      <label>Scan File</label>
      <strong style="font-size:12px;">${scanFileName}</strong>
    </div>
  </div>

  <div class="summary-grid">
    <div class="stat-card">
      <div class="num">${measurements.summary.totalTeeth}</div>
      <div class="lbl">Total Teeth Detected</div>
    </div>
    <div class="stat-card">
      <div class="num">${measurements.summary.upperTeeth}</div>
      <div class="lbl">Upper Arch</div>
    </div>
    <div class="stat-card">
      <div class="num">${measurements.summary.lowerTeeth}</div>
      <div class="lbl">Lower Arch</div>
    </div>
  </div>

  <section>
    <h2>Arch Measurements</h2>
    <table>
      <thead><tr><th>Measurement</th><th>Value</th></tr></thead>
      <tbody>${measurements.archMeasurements.map(measRow).join("")}</tbody>
    </table>
  </section>

  ${upperTeeth.length > 0 ? `
  <section>
    <h2>Upper Arch — Tooth Inventory</h2>
    <div class="jaw-label">Quadrants 1 &amp; 2</div>
    <table>
      <thead><tr><th>FDI</th><th>Name</th><th>Vertices</th><th>Width</th></tr></thead>
      <tbody>${upperTeeth.map(toothRow).join("")}</tbody>
    </table>
  </section>` : ""}

  ${lowerTeeth.length > 0 ? `
  <section>
    <h2>Lower Arch — Tooth Inventory</h2>
    <div class="jaw-label">Quadrants 3 &amp; 4</div>
    <table>
      <thead><tr><th>FDI</th><th>Name</th><th>Vertices</th><th>Width</th></tr></thead>
      <tbody>${lowerTeeth.map(toothRow).join("")}</tbody>
    </table>
  </section>` : ""}

  <section>
    <h2>Tooth Width Table</h2>
    <table>
      <thead><tr><th>FDI</th><th>Tooth</th><th>Width (mm)</th></tr></thead>
      <tbody>
        ${measurements.toothWidths.map(m => `
          <tr>
            <td>${m.toothFdi ?? "—"}</td>
            <td>${fdiName[m.toothFdi ?? 0] ?? "—"}</td>
            <td class="val">${m.value}</td>
          </tr>`).join("")}
      </tbody>
    </table>
  </section>

  <footer>
    <span>OrthoVision Platform — AI-Assisted Dental Analysis</span>
    <span>This report is AI-generated. Always verify measurements clinically.</span>
  </footer>
</div>
</body>
</html>`;
}
