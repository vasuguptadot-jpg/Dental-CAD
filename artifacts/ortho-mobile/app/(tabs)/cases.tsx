import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
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
import { useListCases } from "@workspace/api-client-react";
import type { OrthoCase } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";

type CaseStatus =
  | "all"
  | "new"
  | "scan_uploaded"
  | "analysis_completed"
  | "treatment_planning"
  | "approved"
  | "manufacturing";

const STATUS_FILTERS: { key: CaseStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "scan_uploaded", label: "Scan" },
  { key: "analysis_completed", label: "Analysis" },
  { key: "treatment_planning", label: "Planning" },
  { key: "approved", label: "Approved" },
  { key: "manufacturing", label: "Mfg" },
];

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
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.badgeText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

function CaseCard({ orthoCase, onPress }: { orthoCase: OrthoCase; onPress: () => void }) {
  const colors = useColors();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.caseCode, { color: colors.mutedForeground }]}>
          {orthoCase.caseCode}
        </Text>
        <StatusBadge status={orthoCase.status} />
      </View>
      <Text style={[styles.caseTitle, { color: colors.foreground }]} numberOfLines={1}>
        {orthoCase.title ?? "Untitled Case"}
      </Text>
      {orthoCase.patientName && (
        <View style={styles.patientRow}>
          <Feather name="user" size={12} color={colors.mutedForeground} />
          <Text style={[styles.patientName, { color: colors.mutedForeground }]}>
            {orthoCase.patientName}
          </Text>
        </View>
      )}
      <View style={styles.cardFooter}>
        <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
          {new Date(orthoCase.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </Text>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      </View>
    </Pressable>
  );
}

export default function CasesScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState<CaseStatus>("all");

  const { data, isLoading, refetch, isRefetching } = useListCases(
    activeFilter !== "all" ? { status: activeFilter, limit: 50 } : { limit: 50 }
  );

  const cases = data?.cases ?? [];
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Cases</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {STATUS_FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setActiveFilter(f.key)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: activeFilter === f.key ? colors.primary : colors.muted,
                  borderColor: activeFilter === f.key ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: activeFilter === f.key ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={cases}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <CaseCard
              orthoCase={item}
              onPress={() => router.push(`/case/${item.id}`)}
            />
          )}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: Platform.OS === "web" ? 34 + 84 : insets.bottom + 80 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="folder" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                No cases found
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                {activeFilter !== "all" ? "Try a different filter" : "Cases will appear here"}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  card: {
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
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  caseCode: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  caseTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  patientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  patientName: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  dateText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
