import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetPatient, useListCases } from "@workspace/api-client-react";
import type { OrthoCase } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  new: { color: "#6b7280", bg: "#f3f4f6", label: "New" },
  scan_uploaded: { color: "#d97706", bg: "#fef3c7", label: "Scan Uploaded" },
  analysis_completed: { color: "#059669", bg: "#d1fae5", label: "Analysis Done" },
  treatment_planning: { color: "#2563eb", bg: "#dbeafe", label: "In Planning" },
  approved: { color: "#16a34a", bg: "#dcfce7", label: "Approved" },
  manufacturing: { color: "#7c3aed", bg: "#ede9fe", label: "Manufacturing" },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { color: "#6b7280", bg: "#f3f4f6", label: status };
  return (
    <View style={[badge.container, { backgroundColor: config.bg }]}>
      <Text style={[badge.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  container: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  text: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});

function InfoRow({ icon, label, value }: { icon: string; label: string; value?: string | null }) {
  const colors = useColors();
  if (!value) return null;
  return (
    <View style={infoRow.row}>
      <Feather name={icon as never} size={14} color={colors.mutedForeground} style={infoRow.icon} />
      <Text style={[infoRow.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[infoRow.value, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const infoRow = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 8 },
  icon: { width: 20 },
  label: { fontSize: 13, fontFamily: "Inter_400Regular", width: 80 },
  value: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
});

export default function PatientDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const patientId = Number(id);

  const { data: patient, isLoading: patientLoading, error: patientError, refetch: refetchPatient } = useGetPatient(patientId);
  const { data: casesData, isLoading: casesLoading, refetch: refetchCases, isRefetching } = useListCases({ patientId, limit: 50 });

  const cases = casesData?.cases ?? [];
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  if (patientLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (patientError || !patient) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={40} color={colors.destructive} />
        <Text style={[styles.errorTitle, { color: colors.foreground }]}>Patient not found</Text>
        <Pressable onPress={() => refetchPatient()} style={[styles.retryBtn, { borderColor: colors.border }]}>
          <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const initials = patient.fullName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={cases}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => { refetchPatient(); refetchCases(); }}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text style={[styles.avatarText, { color: colors.primaryForeground }]}>{initials}</Text>
              </View>
              <Text style={[styles.patientName, { color: colors.foreground }]}>{patient.fullName}</Text>
              <Text style={[styles.patientCode, { color: colors.mutedForeground }]}>{patient.patientCode}</Text>

              <View style={[styles.infoSection, { borderTopColor: colors.border }]}>
                <InfoRow icon="calendar" label="Age" value={`${patient.age} years`} />
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <InfoRow icon="user" label="Gender" value={patient.gender} />
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <InfoRow icon="phone" label="Phone" value={patient.mobileNumber} />
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <InfoRow icon="mail" label="Email" value={patient.email} />
                {patient.address && (
                  <>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    <InfoRow icon="map-pin" label="Address" value={patient.address} />
                  </>
                )}
              </View>

              {patient.notes ? (
                <View style={[styles.notesSection, { borderTopColor: colors.border, backgroundColor: colors.muted }]}>
                  <Text style={[styles.notesLabel, { color: colors.mutedForeground }]}>Clinical Notes</Text>
                  <Text style={[styles.notesText, { color: colors.foreground }]}>{patient.notes}</Text>
                </View>
              ) : null}
            </View>

            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Cases ({cases.length})
            </Text>
          </View>
        }
        renderItem={({ item }: { item: OrthoCase }) => (
          <Pressable
            onPress={() => router.push(`/case/${item.id}`)}
            style={({ pressed }) => [
              styles.caseCard,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View style={styles.caseCardHeader}>
              <Text style={[styles.caseCode, { color: colors.mutedForeground }]}>{item.caseCode}</Text>
              <StatusBadge status={item.status} />
            </View>
            <Text style={[styles.caseTitle, { color: colors.foreground }]} numberOfLines={1}>
              {item.title ?? "Untitled Case"}
            </Text>
            <View style={styles.caseFooter}>
              <Text style={[styles.caseDate, { color: colors.mutedForeground }]}>
                {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          casesLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={[styles.emptyState]}>
              <Feather name="folder" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No cases yet</Text>
            </View>
          )
        }
        contentContainerStyle={[styles.list, { paddingBottom: bottomPad + 16 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  retryText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  list: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  profileCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: 24,
    marginBottom: 12,
  },
  avatarText: { fontSize: 24, fontFamily: "Inter_700Bold" },
  patientName: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center", paddingHorizontal: 16 },
  patientCode: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 4, letterSpacing: 0.5, marginBottom: 8 },
  infoSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 4 },
  divider: { height: StyleSheet.hairlineWidth },
  notesSection: { borderTopWidth: StyleSheet.hairlineWidth, padding: 16 },
  notesLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  notesText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold", marginBottom: 8 },
  caseCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  caseCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  caseCode: { fontSize: 12, fontFamily: "Inter_500Medium", letterSpacing: 0.5 },
  caseTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  caseFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  caseDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  emptyState: { alignItems: "center", paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
