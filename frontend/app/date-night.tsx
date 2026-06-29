import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";
import { api } from "@/src/api";

type Idea = {
  title: string;
  description: string;
  checklist: string[];
};

type Step = "budget" | "vibe" | "location" | "loading" | "results";

const BUDGET_OPTIONS = ["Free", "Under $30", "$30–$80", "$80–$150", "Splash out"];
const VIBE_OPTIONS = ["Cosy & chill", "Adventurous", "Romantic", "Active", "Cultural", "Foodie"];

export default function DateNightScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("budget");
  const [budget, setBudget] = useState("");
  const [vibe, setVibe] = useState("");
  const [location, setLocation] = useState("");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<number | null>(null);
  const [saved, setSaved] = useState<Set<number>>(new Set());

  const generate = async () => {
    setStep("loading");
    setError("");
    try {
      const res = await api.post("/date-night/plan", {
        budget,
        vibe,
        location: location.trim() || "anywhere",
      });
      setIdeas(res.data.ideas || []);
      setStep("results");
    } catch {
      setError("Couldn't generate ideas. Check your connection.");
      setStep("location");
    }
  };

  const saveAsList = async (idea: Idea, index: number) => {
    setSaving(index);
    try {
      const listRes = await api.post("/lists", {
        name: `Date: ${idea.title}`,
        type: "custom",
        custom_label: "Date Night",
        share_with_partner: true,
      });
      const listId = listRes.data.id;
      await Promise.all(
        idea.checklist.map((item) =>
          api.post(`/lists/${listId}/items`, { text: item })
        )
      );
      setSaved((prev) => new Set(prev).add(index));
    } catch {
      // ignore — user can retry
    } finally {
      setSaving(null);
    }
  };

  const reset = () => {
    setBudget("");
    setVibe("");
    setLocation("");
    setIdeas([]);
    setSaved(new Set());
    setError("");
    setStep("budget");
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.onSurface} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.heading}>Date Night</Text>
            <Text style={styles.subhead}>Let's plan something.</Text>
          </View>
          {step === "results" && (
            <Pressable onPress={reset} hitSlop={10} style={styles.resetBtn}>
              <Feather name="refresh-cw" size={18} color={colors.brand} />
            </Pressable>
          )}
        </View>
        {step !== "loading" && step !== "results" && (
          <StepIndicator current={step} />
        )}
      </SafeAreaView>

      {step === "budget" && (
        <StepView
          title="What's the budget?"
          hint="Per couple, roughly."
        >
          <View style={styles.chips}>
            {BUDGET_OPTIONS.map((opt) => (
              <Pressable
                key={opt}
                onPress={() => setBudget(opt)}
                style={[styles.chip, budget === opt && styles.chipOn]}
              >
                <Text style={[styles.chipText, budget === opt && styles.chipTextOn]}>{opt}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => setStep("vibe")}
            disabled={!budget}
            style={[styles.cta, !budget && { opacity: 0.35 }]}
          >
            <Text style={styles.ctaText}>Next</Text>
            <Feather name="arrow-right" size={18} color="#fff" />
          </Pressable>
        </StepView>
      )}

      {step === "vibe" && (
        <StepView
          title="What's the vibe?"
          hint="Pick the one that fits the mood."
        >
          <View style={styles.chips}>
            {VIBE_OPTIONS.map((opt) => (
              <Pressable
                key={opt}
                onPress={() => setVibe(opt)}
                style={[styles.chip, vibe === opt && styles.chipOn]}
              >
                <Text style={[styles.chipText, vibe === opt && styles.chipTextOn]}>{opt}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => setStep("location")}
            disabled={!vibe}
            style={[styles.cta, !vibe && { opacity: 0.35 }]}
          >
            <Text style={styles.ctaText}>Next</Text>
            <Feather name="arrow-right" size={18} color="#fff" />
          </Pressable>
        </StepView>
      )}

      {step === "location" && (
        <StepView
          title="Where are you?"
          hint="City, neighbourhood, or just 'at home'."
        >
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. London, Brooklyn, at home…"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.locationInput}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => location.trim() && generate()}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Pressable
            onPress={generate}
            style={styles.cta}
          >
            <Feather name="heart" size={18} color="#fff" />
            <Text style={styles.ctaText}>Plan our date</Text>
          </Pressable>
        </StepView>
      )}

      {step === "loading" && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Planning something special…</Text>
        </View>
      )}

      {step === "results" && (
        <ScrollView contentContainerStyle={styles.resultsScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.resultsMeta}>
            <Text style={styles.resultsMetaText}>{budget} · {vibe} · {location || "anywhere"}</Text>
          </View>
          {ideas.map((idea, i) => (
            <IdeaCard
              key={i}
              idea={idea}
              index={i}
              saving={saving === i}
              saved={saved.has(i)}
              onSave={() => saveAsList(idea, i)}
            />
          ))}
          <Pressable onPress={reset} style={styles.regenerateBtn}>
            <Feather name="refresh-cw" size={16} color={colors.brand} />
            <Text style={styles.regenerateText}>Try different ideas</Text>
          </Pressable>
          <View style={{ height: spacing.xxxl }} />
        </ScrollView>
      )}
    </View>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const steps: Step[] = ["budget", "vibe", "location"];
  return (
    <View style={styles.stepRow}>
      {steps.map((s, i) => (
        <View key={s} style={styles.stepItem}>
          <View style={[styles.stepDot, current === s && styles.stepDotOn, steps.indexOf(current) > i && styles.stepDotDone]}>
            {steps.indexOf(current) > i
              ? <Feather name="check" size={10} color="#fff" />
              : <Text style={[styles.stepNum, current === s && styles.stepNumOn]}>{i + 1}</Text>
            }
          </View>
          {i < steps.length - 1 && (
            <View style={[styles.stepLine, steps.indexOf(current) > i && styles.stepLineDone]} />
          )}
        </View>
      ))}
    </View>
  );
}

function StepView({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepTitle}>{title}</Text>
      <Text style={styles.stepHint}>{hint}</Text>
      {children}
    </ScrollView>
  );
}

function IdeaCard({
  idea,
  index,
  saving,
  saved,
  onSave,
}: {
  idea: Idea;
  index: number;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const CARD_ACCENTS = [colors.brand, "#7A6A55", "#3D7A5E"];
  const accent = CARD_ACCENTS[index % CARD_ACCENTS.length];

  return (
    <View style={[styles.ideaCard, { borderLeftColor: accent, borderLeftWidth: 3 }]}>
      <Pressable onPress={() => setExpanded((x) => !x)} style={styles.ideaHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.ideaTitle}>{idea.title}</Text>
          <Text style={styles.ideaDesc}>{idea.description}</Text>
        </View>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.onSurfaceTertiary} />
      </Pressable>

      {expanded && (
        <>
          <View style={styles.checklist}>
            {idea.checklist.map((item, i) => (
              <View key={i} style={styles.checklistRow}>
                <View style={[styles.checklistBullet, { backgroundColor: accent }]} />
                <Text style={styles.checklistText}>{item}</Text>
              </View>
            ))}
          </View>
          <Pressable
            onPress={onSave}
            disabled={saving || saved}
            style={[styles.saveBtn, saved && styles.saveBtnDone]}
          >
            {saving ? (
              <ActivityIndicator size="small" color={saved ? "#fff" : colors.brand} />
            ) : (
              <>
                <Feather name={saved ? "check" : "plus"} size={16} color={saved ? "#fff" : colors.brand} />
                <Text style={[styles.saveBtnText, saved && styles.saveBtnTextDone]}>
                  {saved ? "Saved to lists" : "Save as list"}
                </Text>
              </>
            )}
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1 },
  resetBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  heading: { fontFamily: fonts.display, fontSize: fontSize.xxxl, color: colors.onSurface },
  subhead: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, marginTop: 2 },
  stepRow: { flexDirection: "row", alignItems: "center" },
  stepItem: { flexDirection: "row", alignItems: "center" },
  stepDot: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface,
  },
  stepDotOn: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  stepDotDone: { borderColor: colors.brand, backgroundColor: colors.brand },
  stepNum: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.onSurfaceTertiary },
  stepNumOn: { color: colors.brand },
  stepLine: { width: 32, height: 1.5, backgroundColor: colors.border, marginHorizontal: 4 },
  stepLineDone: { backgroundColor: colors.brand },
  stepContent: { padding: spacing.xl, gap: spacing.xl },
  stepTitle: { fontFamily: fonts.display, fontSize: 28, color: colors.onSurface, lineHeight: 34 },
  stepHint: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, marginTop: -spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurface },
  chipTextOn: { color: "#fff" },
  locationInput: {
    fontFamily: fonts.body, fontSize: fontSize.xl, color: colors.onSurface,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
    padding: spacing.lg,
  },
  errorText: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.warning },
  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, backgroundColor: colors.brand,
    borderRadius: radius.pill, paddingVertical: 16,
    marginTop: spacing.sm,
  },
  ctaText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.lg, color: "#fff" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.lg },
  loadingText: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurfaceSecondary },
  resultsScroll: { padding: spacing.xl, gap: spacing.lg },
  resultsMeta: {
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, backgroundColor: colors.brandTertiary,
    alignSelf: "flex-start",
  },
  resultsMetaText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.onBrandTertiary },
  ideaCard: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary, overflow: "hidden",
  },
  ideaHeader: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.md,
    padding: spacing.lg,
  },
  ideaTitle: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurface, lineHeight: 26 },
  ideaDesc: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, lineHeight: 20, marginTop: 4 },
  checklist: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  checklistRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  checklistBullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  checklistText: { flex: 1, fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurface, lineHeight: 22 },
  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, margin: spacing.lg, marginTop: spacing.sm,
    borderRadius: radius.pill, paddingVertical: spacing.md,
    borderWidth: 1.5, borderColor: colors.brand,
  },
  saveBtnDone: { backgroundColor: colors.brand, borderColor: colors.brand },
  saveBtnText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.base, color: colors.brand },
  saveBtnTextDone: { color: "#fff" },
  regenerateBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, paddingVertical: spacing.lg,
  },
  regenerateText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.base, color: colors.brand },
});
