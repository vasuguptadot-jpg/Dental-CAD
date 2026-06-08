import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetCase } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; step: number }> = {
  new: { color: "#6b7280", bg: "#f3f4f6", label: "New", step: 0 },
  scan_uploaded: { color: "#d97706", bg: "#fef3c7", label: "Scan Uploaded", step: 1 },
  analysis_completed: { color: "#059669", bg: "#d1fae5", label: "Analysis Done", step: 2 },
  treatment_planning: { color: "#2563eb", bg: "#dbeafe", label: "In Planning", step: 3 },
  approved: { color: "#16a34a", bg: "#dcfce7", label: "Approved", step: 4 },
  manufacturing: { color: "#7c3aed", bg: "#ede9fe", label: "Manufacturing", step: 5 },
};

const STATUS_STEPS = [
  "New",
  "Scan",
  "Analysis",
  "Planning",
  "Approved",
  "Mfg",
];

function StatusStepper({ status, colors }: { status: string; colors: ReturnType<typeof useColors> }) {
  const config = STATUS_CONFIG[status];
  const currentStep = config?.step ?? 0;

  return (
    <View style={stepper.container}>
      {STATUS_STEPS.map((label, i) => {
        const done = i <= currentStep;
        const active = i === currentStep;
        return (
          <React.Fragment key={i}>
            <View style={stepper.stepCol}>
              <View
                style={[
                  stepper.dot,
                  {
                    backgroundColor: done ? config?.color ?? colors.primary : colors.border,
                    borderColor: active ? config?.color ?? colors.primary : "transparent",
                    borderWidth: active ? 2 : 0,
                  },
                ]}
              />
              <Text
                style={[
                  stepper.label,
                  {
                    color: done ? colors.foreground : colors.mutedForeground,
                    fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
                  },
                ]}
              >
                {label}
              </Text>
            </View>
            {i < STATUS_STEPS.length - 1 && (
              <View
                style={[
                  stepper.line,
                  { backgroundColor: i < currentStep ? config?.color ?? colors.primary : colors.border },
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const stepper = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 16 },
  stepCol: { alignItems: "center", gap: 4, flex: 0 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { fontSize: 10, textAlign: "center", width: 42 },
  line: { flex: 1, height: 2, marginTop: 4, marginHorizontal: 2 },
});

export default function CaseDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const caseId = Number(id);

  const { data: orthoCase, isLoading, error, refetch, isRefetching } = useGetCase(caseId);
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !orthoCase) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={40} color={colors.destructive} />
        <Text style={[styles.errorTitle, { color: colors.foreground }]}>Case not found</Text>
        <Pressable onPress={() => refetch()} style={[styles.retryBtn, { borderColor: colors.border }]}>
          <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const config = STATUS_CONFIG[orthoCase.status];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: bottomPad + 24 }}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
      }
    >
      <View style={styles.content}>
        <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.caseHeaderRow}>
            <Text style={[styles.caseCode, { color: colors.mutedForeground }]}>
              {orthoCase.caseCode}
            </Text>
            {config && (
              <View style={[styles.badge, { backgroundColor: config.bg }]}>
                <Text style={[styles.badgeText, { color: config.color }]}>{config.label}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.caseTitle, { color: colors.foreground }]}>
            {orthoCase.title ?? "Untitled Case"}
          </Text>

          {orthoCase.patientName && (
            <Pressable
              style={[styles.patientLink, { backgroundColor: colors.muted }]}
              onPress={() => router.push(`/patient/${orthoCase.patientId}`)}
            >
              <Feather name="user" size={14} color={colors.primary} />
              <Text style={[styles.patientLinkText, { color: colors.primary }]}>
                {orthoCase.patientName}
              </Text>
              <Feather name="chevron-right" size={14} color={colors.primary} />
            </Pressable>
          )}
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Progress</Text>
          <StatusStepper status={orthoCase.status} colors={colors} />
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Details</Text>
          <View style={styles.detailGrid}>
            <View style={styles.detailItem}>
              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Created</Text>
              <Text style={[styles.detailValue, { color: colors.foreground }]}>
                {new Date(orthoCase.createdAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </Text>
            </View>
            {orthoCase.updatedAt && (
              <View style={styles.detailItem}>
                <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Updated</Text>
                <Text style={[styles.detailValue, { color: colors.foreground }]}>
                  {new Date(orthoCase.updatedAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Text>
              </View>
            )}
          </View>
        </View>

        {orthoCase.notes ? (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Clinical Notes</Text>
            <Text style={[styles.notesText, { color: colors.foreground }]}>{orthoCase.notes}</Text>
          </View>
        ) : (
          <View style={[styles.section, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <View style={styles.emptyNotes}>
              <Feather name="file-text" size={20} color={colors.mutedForeground} />
              <Text style={[styles.emptyNotesText, { color: colors.mutedForeground }]}>
                No clinical notes added
              </Text>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  retryText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  content: { padding: 16, gap: 12 },
  headerCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  caseHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  caseCode: { fontSize: 12, fontFamily: "Inter_500Medium", letterSpacing: 0.5 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  caseTitle: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.3, lineHeight: 28 },
  patientLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  patientLinkText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  section: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  detailGrid: { gap: 12 },
  detailItem: { gap: 2 },
  detailLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  detailValue: { fontSize: 14, fontFamily: "Inter_400Regular" },
  notesText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  emptyNotes: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  emptyNotesText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
