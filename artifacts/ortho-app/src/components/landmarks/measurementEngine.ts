import type { ToothLandmark, DentalMeasurement, LandmarkType, Vec3 } from "./types";

function dist3D(a: Vec3, b: Vec3): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function dist2D(a: Vec3, b: Vec3): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
}

function status(value: number, range?: [number, number]): DentalMeasurement["status"] {
  if (!range) return "info";
  if (value >= range[0] && value <= range[1]) return "normal";
  const margin = (range[1] - range[0]) * 0.15;
  if (value >= range[0] - margin && value <= range[1] + margin) return "warning";
  return "alert";
}

type LandmarkIndex = Map<number, Map<LandmarkType, Vec3>>;

function buildIndex(landmarks: ToothLandmark[]): LandmarkIndex {
  const index: LandmarkIndex = new Map();
  for (const lm of landmarks) {
    if (!index.has(lm.toothId)) index.set(lm.toothId, new Map());
    index.get(lm.toothId)!.set(lm.type, lm.position);
  }
  return index;
}

function getPos(index: LandmarkIndex, toothId: number, type: LandmarkType): Vec3 | undefined {
  return index.get(toothId)?.get(type);
}

function getCuspOrIncisal(index: LandmarkIndex, toothId: number): Vec3 | undefined {
  return getPos(index, toothId, "cusp") ?? getPos(index, toothId, "incisal_edge");
}

export function calculateMeasurements(
  landmarks: ToothLandmark[],
  jawType: string
): DentalMeasurement[] {
  const index = buildIndex(landmarks);
  const measurements: DentalMeasurement[] = [];
  const presentTeeth = new Set(landmarks.map((l) => l.toothId));

  const isUpper = jawType === "upper" || jawType === "full" || jawType === "unknown";
  const isLower = jawType === "lower" || jawType === "full";

  // === ARCH WIDTH ===
  // Upper inter-molar width (16–26)
  if (isUpper) {
    const c16 = getPos(index, 16, "center");
    const c26 = getPos(index, 26, "center");
    if (c16 && c26) {
      const val = dist2D(c16, c26);
      measurements.push({
        id: "upper_intermolar_width",
        name: "Upper Inter-Molar Width",
        value: +val.toFixed(2),
        unit: "mm",
        type: "inter_molar",
        teeth: [16, 26],
        normalRange: [52, 60],
        description: "Distance between upper 1st molar centroids (FDI 16–26)",
        status: status(val, [52, 60]),
      });
    }

    // Upper inter-premolar width (14–24)
    const c14 = getPos(index, 14, "center");
    const c24 = getPos(index, 24, "center");
    if (c14 && c24) {
      const val = dist2D(c14, c24);
      measurements.push({
        id: "upper_interpremolar_width",
        name: "Upper Inter-Premolar Width",
        value: +val.toFixed(2),
        unit: "mm",
        type: "arch_width",
        teeth: [14, 24],
        normalRange: [38, 46],
        description: "Distance between upper 1st premolar centroids (FDI 14–24)",
        status: status(val, [38, 46]),
      });
    }

    // Upper inter-canine width (13–23)
    const cusp13 = getCuspOrIncisal(index, 13);
    const cusp23 = getCuspOrIncisal(index, 23);
    if (cusp13 && cusp23) {
      const val = dist2D(cusp13, cusp23);
      measurements.push({
        id: "upper_intercanine_width",
        name: "Upper Inter-Canine Width",
        value: +val.toFixed(2),
        unit: "mm",
        type: "inter_canine",
        teeth: [13, 23],
        normalRange: [33, 38],
        description: "Cusp-tip to cusp-tip width of upper canines (FDI 13–23)",
        status: status(val, [33, 38]),
      });
    }
  }

  // Lower arch measurements
  if (isLower) {
    const c36 = getPos(index, 36, "center");
    const c46 = getPos(index, 46, "center");
    if (c36 && c46) {
      const val = dist2D(c36, c46);
      measurements.push({
        id: "lower_intermolar_width",
        name: "Lower Inter-Molar Width",
        value: +val.toFixed(2),
        unit: "mm",
        type: "inter_molar",
        teeth: [36, 46],
        normalRange: [48, 56],
        description: "Distance between lower 1st molar centroids (FDI 36–46)",
        status: status(val, [48, 56]),
      });
    }

    const cusp33 = getCuspOrIncisal(index, 33);
    const cusp43 = getCuspOrIncisal(index, 43);
    if (cusp33 && cusp43) {
      const val = dist2D(cusp33, cusp43);
      measurements.push({
        id: "lower_intercanine_width",
        name: "Lower Inter-Canine Width",
        value: +val.toFixed(2),
        unit: "mm",
        type: "inter_canine",
        teeth: [33, 43],
        normalRange: [26, 30],
        description: "Cusp-tip to cusp-tip width of lower canines (FDI 33–43)",
        status: status(val, [26, 30]),
      });
    }
  }

  // === ARCH LENGTH ===
  // Approximate: sum of tooth widths from first molar to first molar along the arch
  const upperTeethOrder = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const lowerTeethOrder = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

  const calcArchLength = (order: number[], label: string, normalRange: [number, number]) => {
    const presentOrder = order.filter((id) => presentTeeth.has(id));
    if (presentOrder.length < 3) return;
    let length = 0;
    for (let i = 0; i < presentOrder.length - 1; i++) {
      const a = getPos(index, presentOrder[i], "center");
      const b = getPos(index, presentOrder[i + 1], "center");
      if (a && b) length += dist2D(a, b);
    }
    if (length > 0) {
      measurements.push({
        id: `${label.toLowerCase().replace(" ", "_")}_arch_length`,
        name: `${label} Arch Length`,
        value: +length.toFixed(2),
        unit: "mm",
        type: "arch_length",
        teeth: presentOrder,
        normalRange,
        description: `Approximate arch length from molar to molar along centroid chain`,
        status: status(length, normalRange),
      });
    }
  };

  if (isUpper) calcArchLength(upperTeethOrder, "Upper", [60, 72]);
  if (isLower) calcArchLength(lowerTeethOrder, "Lower", [56, 68]);

  // === TOOTH WIDTHS ===
  const toothWidthTargets = isUpper
    ? [11, 12, 13, 14, 15, 16, 21, 22, 23, 24, 25, 26]
    : [31, 32, 33, 34, 35, 36, 41, 42, 43, 44, 45, 46];

  for (const toothId of toothWidthTargets) {
    const cm = getPos(index, toothId, "contact_mesial");
    const cd = getPos(index, toothId, "contact_distal");
    if (cm && cd) {
      const val = dist3D(cm, cd);
      const normalWidths: Record<number, [number, number]> = {
        11: [8.0, 9.5], 21: [8.0, 9.5],
        12: [6.5, 7.5], 22: [6.5, 7.5],
        13: [7.5, 8.5], 23: [7.5, 8.5],
        14: [6.5, 7.5], 24: [6.5, 7.5],
        15: [6.0, 7.5], 25: [6.0, 7.5],
        16: [10.0, 12.0], 26: [10.0, 12.0],
        31: [5.0, 5.5], 41: [5.0, 5.5],
        32: [6.0, 6.5], 42: [6.0, 6.5],
        33: [6.5, 7.0], 43: [6.5, 7.0],
        34: [7.0, 7.5], 44: [7.0, 7.5],
        35: [7.0, 7.5], 45: [7.0, 7.5],
        36: [10.5, 12.0], 46: [10.5, 12.0],
      };
      const range = normalWidths[toothId];
      measurements.push({
        id: `tooth_width_${toothId}`,
        name: `Tooth ${toothId} Width`,
        value: +val.toFixed(2),
        unit: "mm",
        type: "tooth_width",
        teeth: [toothId],
        normalRange: range,
        description: `Mesiodistal width of tooth ${toothId}`,
        status: status(val, range),
      });
    }
  }

  // === MIDLINE DEVIATION ===
  if (isUpper) {
    const c11 = getPos(index, 11, "center");
    const c21 = getPos(index, 21, "center");
    if (c11 && c21) {
      const midX = (c11.x + c21.x) / 2;
      const dev = Math.abs(midX);
      measurements.push({
        id: "upper_midline_deviation",
        name: "Upper Midline Deviation",
        value: +dev.toFixed(2),
        unit: "mm",
        type: "midline_deviation",
        teeth: [11, 21],
        normalRange: [0, 2],
        description: "Offset of upper dental midline from arch centerline",
        status: status(dev, [0, 2]),
      });
    }
  }

  if (isLower) {
    const c31 = getPos(index, 31, "center");
    const c41 = getPos(index, 41, "center");
    if (c31 && c41) {
      const midX = (c31.x + c41.x) / 2;
      const dev = Math.abs(midX);
      measurements.push({
        id: "lower_midline_deviation",
        name: "Lower Midline Deviation",
        value: +dev.toFixed(2),
        unit: "mm",
        type: "midline_deviation",
        teeth: [31, 41],
        normalRange: [0, 2],
        description: "Offset of lower dental midline from arch centerline",
        status: status(dev, [0, 2]),
      });
    }
  }

  return measurements;
}
