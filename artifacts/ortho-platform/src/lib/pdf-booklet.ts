import jsPDF from "jspdf";

export interface AlignerStageData {
  stageNumber: number;
  totalStages: number;
  toothMovements: { fdi: number; label: string; tx: number; ty: number; tz: number; rx: number; ry: number; rz: number }[];
  weeksWear: number;
  patientName?: string;
  caseCode?: string;
  doctorName?: string;
}

const BRAND_COLOR: [number, number, number] = [6, 182, 212]; // cyan-500

function drawHeader(doc: jsPDF, stage: AlignerStageData, pageWidth: number) {
  doc.setFillColor(15, 15, 20);
  doc.rect(0, 0, pageWidth, 28, "F");
  doc.setFillColor(...BRAND_COLOR);
  doc.rect(0, 0, 4, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("OrthoVision", 10, 11);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 180, 180);
  doc.text("Aligner Treatment Booklet", 10, 18);

  if (stage.patientName) {
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text(`Patient: ${stage.patientName}`, pageWidth - 8, 10, { align: "right" });
  }
  if (stage.caseCode) {
    doc.setTextColor(180, 180, 180);
    doc.setFontSize(8);
    doc.text(`Case: ${stage.caseCode}`, pageWidth - 8, 18, { align: "right" });
  }
}

function drawStageCard(doc: jsPDF, stage: AlignerStageData, y: number, pageWidth: number) {
  const cardX = 8;
  const cardW = pageWidth - 16;

  doc.setFillColor(22, 22, 30);
  doc.roundedRect(cardX, y, cardW, 36, 3, 3, "F");

  doc.setFillColor(...BRAND_COLOR);
  doc.roundedRect(cardX, y, 38, 36, 3, 3, "F");
  doc.rect(cardX + 35, y, 3, 36, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(`${stage.stageNumber}`, cardX + 19, y + 18, { align: "center" });

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 220, 235);
  doc.text(`of ${stage.totalStages}`, cardX + 19, y + 27, { align: "center" });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Aligner Stage ${stage.stageNumber}`, cardX + 48, y + 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(180, 180, 180);
  doc.text(`Wear duration: ${stage.weeksWear} week${stage.weeksWear !== 1 ? "s" : ""} (22 hours/day)`, cardX + 48, y + 21);
  doc.text(`Start date: _______________  End date: _______________`, cardX + 48, y + 29);
}

function drawToothTable(doc: jsPDF, stage: AlignerStageData, y: number, pageWidth: number): number {
  const moves = stage.toothMovements.filter(t =>
    Math.abs(t.tx) > 0.05 || Math.abs(t.ty) > 0.05 || Math.abs(t.tz) > 0.05 ||
    Math.abs(t.rx) > 0.5 || Math.abs(t.ry) > 0.5 || Math.abs(t.rz) > 0.5
  );

  if (moves.length === 0) {
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 130);
    doc.text("No significant tooth movements in this stage.", 14, y + 6);
    return y + 12;
  }

  const cols = [14, 45, 75, 97, 119, 141, 162, 183];
  const headers = ["Tooth", "Name", "Buccal (mm)", "Vert. (mm)", "MD (mm)", "Tip (°)", "Torque (°)", "Rot. (°)"];

  // Table header
  doc.setFillColor(30, 30, 40);
  doc.rect(8, y, pageWidth - 16, 8, "F");
  doc.setTextColor(...BRAND_COLOR);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  headers.forEach((h, i) => doc.text(h, cols[i], y + 5.5));

  let rowY = y + 8;
  moves.forEach((t, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(20, 20, 28);
      doc.rect(8, rowY, pageWidth - 16, 7, "F");
    }
    doc.setTextColor(200, 200, 210);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    const vals = [
      String(t.fdi),
      t.label.slice(0, 14),
      fmt(t.tx),
      fmt(t.ty),
      fmt(t.tz),
      fmtDeg(t.rx),
      fmtDeg(t.ry),
      fmtDeg(t.rz),
    ];
    vals.forEach((v, i) => doc.text(v, cols[i], rowY + 5));
    rowY += 7;
  });

  return rowY + 4;
}

function fmt(v: number) { return Math.abs(v) < 0.01 ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}`; }
function fmtDeg(v: number) { return Math.abs(v) < 0.5 ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}°`; }

function drawWearReminder(doc: jsPDF, y: number, pageWidth: number) {
  const reminders = [
    "✓ Wear 22 hours per day — remove only to eat and brush",
    "✓ Brush and floss before reinserting your aligners",
    "✓ Store unused aligners in the provided case",
    "✓ Contact us immediately if an aligner cracks or is lost",
  ];

  doc.setFillColor(15, 40, 30);
  doc.roundedRect(8, y, pageWidth - 16, 26, 2, 2, "F");
  doc.setFillColor(16, 185, 129); // emerald
  doc.roundedRect(8, y, 3, 26, 1, 1, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(52, 211, 153);
  doc.text("Patient Instructions", 15, y + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(180, 220, 200);
  reminders.forEach((r, i) => doc.text(r, 15, y + 13 + i * 4.5));
}

function drawFooter(doc: jsPDF, pageNum: number, totalPages: number, pageWidth: number, pageHeight: number) {
  doc.setFillColor(10, 10, 15);
  doc.rect(0, pageHeight - 10, pageWidth, 10, "F");
  doc.setTextColor(80, 80, 90);
  doc.setFontSize(7);
  doc.text("OrthoVision Treatment Booklet — Confidential", 10, pageHeight - 4);
  doc.text(`Page ${pageNum} / ${totalPages}`, pageWidth - 10, pageHeight - 4, { align: "right" });
}

export function generateAlignerPDF(stages: AlignerStageData[]): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  stages.forEach((stage, idx) => {
    if (idx > 0) doc.addPage();

    drawHeader(doc, stage, pageWidth);

    let y = 34;
    drawStageCard(doc, stage, y, pageWidth);
    y += 42;

    doc.setTextColor(140, 140, 150);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("TOOTH MOVEMENTS THIS STAGE", 10, y);
    doc.setFillColor(6, 182, 212);
    doc.rect(10, y + 2, pageWidth - 20, 0.3, "F");
    y += 7;

    y = drawToothTable(doc, stage, y, pageWidth);
    y += 4;

    drawWearReminder(doc, y, pageWidth);
    y += 32;

    // Compliance tracker
    doc.setFillColor(20, 20, 30);
    doc.roundedRect(8, y, pageWidth - 16, 22, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(180, 140, 250);
    doc.text("2-Week Wear Tracker", 15, y + 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 130);
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for (let week = 0; week < 2; week++) {
      days.forEach((day, d) => {
        const bx = 15 + d * 26;
        const by = y + 10 + week * 8;
        doc.setFillColor(30, 30, 40);
        doc.roundedRect(bx, by, 22, 6, 1, 1, "F");
        doc.setTextColor(100, 100, 110);
        doc.text(day, bx + 11, by + 4.5, { align: "center" });
      });
    }

    drawFooter(doc, idx + 1, stages.length, pageWidth, pageHeight);
  });

  return doc;
}
