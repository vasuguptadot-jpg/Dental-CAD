import { Feather } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useLogout } from "@workspace/api-client-react";

const BASE = Platform.OS === "web" ? "" : process.env.EXPO_PUBLIC_API_URL ?? "";

function getWebUrl(path: string) {
  if (Platform.OS === "web") {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}${path}`;
  }
  return `${BASE}${path}`;
}

function Row({
  icon,
  label,
  subtitle,
  onPress,
  chevron = true,
  danger = false,
}: {
  icon: string;
  label: string;
  subtitle?: string;
  onPress: () => void;
  chevron?: boolean;
  danger?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.card,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: danger ? colors.destructive + "20" : colors.muted }]}>
        <Feather name={icon as any} size={18} color={danger ? colors.destructive : colors.primary} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: danger ? colors.destructive : colors.foreground }]}>{label}</Text>
        {subtitle ? <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
      </View>
      {chevron && <Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
    </Pressable>
  );
}

function SectionHeader({ title }: { title: string }) {
  const colors = useColors();
  return (
    <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
  );
}

export default function MoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { doctor } = useAuth();
  const logout = useLogout();

  const openUrl = (path: string) => {
    const url = getWebUrl(path);
    if (Platform.OS === "web") {
      window.open(url, "_blank");
    } else {
      Linking.openURL(url);
    }
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => {
          logout.mutate(undefined, {
            onSuccess: () => router.replace("/login"),
          });
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top > 0 ? 0 : 16 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>More</Text>
        {doctor && (
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{doctor.email}</Text>
        )}
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}>
        <SectionHeader title="Web Platform" />
        <View style={[styles.section, { borderColor: colors.border }]}>
          <Row
            icon="monitor"
            label="OrthoVision Platform"
            subtitle="Full clinical workspace"
            onPress={() => openUrl("/dashboard")}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Row
            icon="shield"
            label="Security Analyzer"
            subtitle="Vulnerability & compliance dashboard"
            onPress={() => openUrl("/security-analyzer/")}
          />
        </View>

        <SectionHeader title="Account" />
        <View style={[styles.section, { borderColor: colors.border }]}>
          <Row
            icon="user"
            label={doctor?.name ?? "Profile"}
            subtitle={doctor?.email}
            onPress={() => {}}
            chevron={false}
          />
        </View>

        <SectionHeader title="Session" />
        <View style={[styles.section, { borderColor: colors.border }]}>
          <Row
            icon="log-out"
            label="Sign Out"
            onPress={handleLogout}
            danger
            chevron={false}
          />
        </View>

        <Text style={[styles.version, { color: colors.mutedForeground }]}>OrthoVision Mobile · v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  scroll: { paddingTop: 8 },
  sectionHeader: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 6,
  },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowLabel: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  rowSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },
  version: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 32,
  },
});
