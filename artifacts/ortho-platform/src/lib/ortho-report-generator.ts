import type { OrthoAnalysisResult, OrthoCondition, Severity } from "./ortho-analysis-engine";
import type { ToothSegment } from "./segmentation-engine";
import type { MeasurementSet } from "./measurement-engine";

interface OrthoReportData {
  patientName?: string;
  caseCode?: string;
  scanFileName: string;
  jawType: string;
  segments: ToothSegment[];
  measurements: MeasurementSet;
  analysis: OrthoAnalysisResult;
  generatedAt: string;
}

function severityColor(s: Severity): string {
  switch (s) {
    case "none": return "#22c55e";
    case "mild": return "#eab308";
    case "moderate": return "#f97316";
    case "severe": return "#ef4444";
  }
}

function complexityColor(c: OrthoAnalysisResult["treatmentComplexity"]): string {
  switch (c) {
    case "simple": return "#22c55e";
    case "moderate": return "#eab308";
    case "complex": return "#f97316";
    case "very_complex": return "#ef4444";
  }
}

function scoreMeter(score: number): string {
  const pct = (score / 10) * 100;
  const color = score < 4 ? "#22c55e" : score < 7 ? "#f97316" : "#ef4444";
  return `
    <div class="score-meter">
      <div class="score-bar" style="width:${pct}%;background:${color};"></div>
    </div>`;
}

function conditionRow(c: OrthoCondition): string {
  const sColor = severityColor(c.severity);
  const affected = c.affectedTeeth.length > 0 ? c.affectedTeeth.slice(0, 8).join(", ") : "—";
  return `
  <tr>
    <td><strong>${c.name}</strong></td>
    <td><span class="badge" style="background:${sColor}22;color:${sColor};border:1px solid ${sColor}44;">${c.severity.toUpperCase()}</span></td>
    <td>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-weight:700;color:${sColor};min-width:28px;">${c.score}</span>
        ${scoreMeter(c.score)}
      </div>
    </td>
    <td style="font-size:11px;color:#64748b;">${affected}</td>
  </tr>`;
}

function conditionDetail(c: OrthoCondition, idx: number): string {
  const sColor = severityColor(c.severity);
  return `
  <div class="condition-card">
    <div class="condition-header">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="condition-num">${idx + 1}</div>
        <div>
          <div class="condition-title">${c.name}</div>
          <span class="badge" style="background:${sColor}22;color:${sColor};border:1px solid ${sColor}44;">${c.severity.toUpperCase()} — Score ${c.score}/10</span>
        </div>
      </div>
      ${scoreMeter(c.score)}
    </div>
    <div class="condition-body">
      <div class="detail-block">
        <div class="detail-label">Clinical Findings</div>
        <p>${c.explanation}</p>
      </div>
      <div class="detail-block" style="background:#fff7ed;border-left:3px solid #f97316;">
        <div class="detail-label" style="color:#ea580c;">Clinical Significance</div>
        <p>${c.clinicalSignificance}</p>
      </div>
      ${c.affectedTeeth.length > 0 ? `
      <div class="detail-block">
        <div class="detail-label">Affected Teeth (FDI)</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
          ${c.affectedTeeth.slice(0, 12).map(t => `<span class="tooth-chip">${t}</span>`).join("")}
        </div>
      </div>` : ""}
    </div>
  </div>`;
}

export function generateOrthoReportHTML(data: OrthoReportData): string {
  const { patientName, caseCode, scanFileName, jawType, segments, measurements, analysis } = data;
  const date = new Date(data.generatedAt);

  const activeConditions = analysis.conditions.filter(c => c.severity !== "none");
  const severeConditions = analysis.conditions.filter(c => c.severity === "severe");
  const moderateConditions = analysis.conditions.filter(c => c.severity === "moderate");

  const cxColor = complexityColor(analysis.treatmentComplexity);
  const ovColor = severityColor(analysis.overallSeverity);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OrthoVision — Orthodontic Analysis Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1a2e; background: #f8fafc; }
    .page { max-width: 960px; margin: 0 auto; padding: 40px; background: white; }

    header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0ea5e9; padding-bottom: 24px; margin-bottom: 32px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-icon { width: 48px; height: 48px; background: #0c1a2e; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #0ea5e9; font-size: 18px; font-weight: 900; }
    .brand-name { font-size: 24px; font-weight: 800; color: #0c1a2e; }
    .brand-sub { font-size: 11px; color: #64748b; letter-spacing: 0.08em; text-transform: uppercase; margin-top: 2px; }
    .report-meta { text-align: right; font-size: 12px; color: #64748b; line-height: 1.6; }
    .report-meta strong { display: block; font-size: 16px; color: #1a1a2e; margin-bottom: 4px; }

    .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
    .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; }
    .info-card label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; display: block; margin-bottom: 4px; }
    .info-card strong { font-size: 14px; color: #1a1a2e; }

    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 32px; }
    .kpi-card { background: #0c1a2e; color: white; border-radius: 12px; padding: 20px; text-align: center; }
    .kpi-num { font-size: 32px; font-weight: 800; line-height: 1; }
    .kpi-label { font-size: 10px; color: #94a3b8; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.06em; }

    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; color: #0ea5e9; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 18px; margin-top: 32px; }

    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f1f5f9; text-align: left; padding: 10px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; border-bottom: 2px solid #e2e8f0; }
    td { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }

    .badge { display: inline-block; padding: 3px 9px; border-radius: 99px; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; }
    .score-meter { flex: 1; height: 6px; background: #e2e8f0; border-radius: 99px; overflow: hidden; max-width: 120px; }
    .score-bar { height: 100%; border-radius: 99px; transition: width 0.3s; }

    .condition-card { border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 16px; overflow: hidden; }
    .condition-header { background: #f8fafc; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .condition-num { width: 32px; height: 32px; border-radius: 50%; background: #0c1a2e; color: #0ea5e9; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0; }
    .condition-title { font-size: 16px; font-weight: 700; color: #1a1a2e; margin-bottom: 4px; }
    .condition-body { padding: 16px 20px; display: grid; gap: 12px; }
    .detail-block { background: #f8fafc; border-radius: 8px; padding: 12px 14px; border-left: 3px solid #0ea5e9; }
    .detail-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 6px; font-weight: 600; }
    .detail-block p { font-size: 13px; color: #374151; line-height: 1.6; }
    .tooth-chip { display: inline-block; background: #0c1a2e; color: #0ea5e9; border-radius: 6px; padding: 3px 8px; font-size: 12px; font-weight: 600; }

    .summary-box { background: linear-gradient(135deg, #0c1a2e 0%, #1e3a5f 100%); color: white; border-radius: 14px; padding: 24px; margin-bottom: 28px; }
    .summary-box h3 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: #0ea5e9; margin-bottom: 12px; }
    .summary-box p { font-size: 14px; line-height: 1.7; color: #cbd5e1; }

    footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; }
    @media print { body { background: white; } .page { padding: 20px; max-width: 100%; } @page { margin: 15mm; } }
  </style>
</head>
<body>
<div class="page">

  <header>
    <div class="brand">
      <div class="brand-icon">OV</div>
      <div>
        <div class="brand-name">OrthoVision</div>
        <div class="brand-sub">Orthodontic Analysis Report</div>
      </div>
    </div>
    <div class="report-meta">
      <strong>AI Orthodontic Analysis</strong>
      ${date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}<br>
      ${date.toLocaleTimeString()}<br>
      <span style="font-size:10px;color:#94a3b8;">AI-generated — verify clinically</span>
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
      <strong style="font-size:11px;">${scanFileName}</strong>
    </div>
    <div class="info-card">
      <label>Jaw</label>
      <strong style="text-transform:capitalize;">${jawType}</strong>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-num">${measurements.summary.totalTeeth}</div>
      <div class="kpi-label">Total Teeth</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num" style="color:${ovColor};">${analysis.overallSeverity.toUpperCase()}</div>
      <div class="kpi-label">Overall Severity</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num" style="color:${cxColor};">${analysis.complexityScore}</div>
      <div class="kpi-label">Complexity Score</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num" style="color:#0ea5e9;">${activeConditions.length}</div>
      <div class="kpi-label">Active Conditions</div>
    </div>
  </div>

  <div class="summary-box">
    <h3>Analysis Summary</h3>
    <p>${analysis.summary}</p>
  </div>

  <h2>Condition Overview</h2>
  <table>
    <thead>
      <tr>
        <th>Condition</th>
        <th>Severity</th>
        <th>Score / 10</th>
        <th>Affected Teeth (FDI)</th>
      </tr>
    </thead>
    <tbody>
      ${analysis.conditions.map(conditionRow).join("")}
    </tbody>
  </table>

  <h2>Detailed Findings</h2>
  ${analysis.conditions.map((c, i) => conditionDetail(c, i)).join("")}

  <h2>Arch Measurements</h2>
  <table>
    <thead><tr><th>Measurement</th><th>Value</th></tr></thead>
    <tbody>
      ${measurements.archMeasurements.map(m => `<tr><td>${m.label}</td><td><strong>${m.value} ${m.unit}</strong></td></tr>`).join("")}
    </tbody>
  </table>

  <h2>Treatment Complexity Assessment</h2>
  <div class="condition-card">
    <div class="condition-header">
      <div>
        <div class="condition-title">Complexity: ${analysis.treatmentComplexity.replace("_", " ").toUpperCase()}</div>
        <div style="margin-top:6px;">
          <span class="badge" style="background:${cxColor}22;color:${cxColor};border:1px solid ${cxColor}44;">Score: ${analysis.complexityScore}/10</span>
        </div>
      </div>
    </div>
    <div class="condition-body">
      ${severeConditions.length > 0 ? `<div class="detail-block" style="background:#fef2f2;border-left:3px solid #ef4444;">
        <div class="detail-label" style="color:#dc2626;">Priority Issues (Severe)</div>
        <p>${severeConditions.map(c => c.name).join(", ")}</p>
      </div>` : ""}
      ${moderateConditions.length > 0 ? `<div class="detail-block" style="background:#fff7ed;border-left:3px solid #f97316;">
        <div class="detail-label" style="color:#ea580c;">Secondary Issues (Moderate)</div>
        <p>${moderateConditions.map(c => c.name).join(", ")}</p>
      </div>` : ""}
      <div class="detail-block">
        <div class="detail-label">Recommended Next Steps</div>
        <p>A full clinical examination including CBCT, facial photographs, and study models is required to confirm these AI-generated findings. Consult with the treatment planning module for movement recommendations.</p>
      </div>
    </div>
  </div>

  <footer>
    <span>OrthoVision Platform — AI Orthodontic Analysis Engine v2.0</span>
    <span>This report is AI-generated. Always verify clinically before treatment decisions.</span>
  </footer>
</div>
</body>
</html>`;
}
