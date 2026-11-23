import { ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, iconSizes } from "@cultuvilla/shared/design-system";
import { BottomSheet, HStack, Pressable, Text, VStack } from "../../primitives";
import { useT } from "../../../lib/i18n";

export interface SheetOption {
  key: string;
  label: string;
  /** One short line under the label, for choices the label alone doesn't explain. */
  description?: string;
  selected?: boolean;
  /** With an icon, the choice is drawn as an action row (icon, label, chevron), like the village's «Añadir contenido». */
  icon?: keyof typeof Ionicons.glyphMap;
}

/** A bottom sheet of tappable choices — pick a cargo, pick a member to link. */
export function OptionsSheet({
  visible,
  title,
  hint,
  emptyLabel,
  options,
  onPick,
  onClose,
  testID,
}: {
  visible: boolean;
  title: string;
  hint?: string;
  emptyLabel?: string;
  options: SheetOption[];
  onPick: (key: string) => void;
  onClose: () => void;
  testID?: string;
}) {
  const { t } = useT();
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      closeLabel={t("common.close")}
      testID={testID}
    >
      {/* flexShrink, not a fixed height: the sheet caps itself, and a group with
          more members than fit on screen must still reach the last one. */}
      <ScrollView
        style={{ flexShrink: 1 }}
        keyboardShouldPersistTaps="handled"
        testID={testID ? `${testID}-scroll` : undefined}
      >
        <VStack gap={1} className="px-5">
          {hint ? (
            <Text tone="muted" variant="bodySm" className="pb-2">
              {hint}
            </Text>
          ) : null}
          {options.length === 0 && emptyLabel ? (
            <Text tone="muted">{emptyLabel}</Text>
          ) : null}
          {options.map((o) =>
            o.icon ? (
              <Pressable
                key={o.key}
                testID={`${testID ?? "options"}-${o.key}`}
                accessibilityRole="button"
                accessibilityLabel={o.label}
                onPress={() => onPick(o.key)}
                className="border-b border-subtle active:opacity-70"
              >
                <HStack gap={3} className="items-center py-4">
                  <Ionicons
                    name={o.icon}
                    size={iconSizes.lg}
                    color={colors.light.fg.accent}
                  />
                  <VStack gap={0} className="flex-1">
                    <Text className="font-semibold">{o.label}</Text>
                    {o.description ? (
                      <Text tone="muted" variant="bodySm">
                        {o.description}
                      </Text>
                    ) : null}
                  </VStack>
                  <Ionicons
                    name="chevron-forward"
                    size={iconSizes.sm}
                    color={colors.light.fg.chevron}
                  />
                </HStack>
              </Pressable>
            ) : (
              <Pressable
                key={o.key}
                testID={`${testID ?? "options"}-${o.key}`}
                accessibilityRole="button"
                accessibilityState={{ selected: o.selected ?? false }}
                onPress={() => onPick(o.key)}
                className="py-3"
              >
                <Text className={o.selected ? "font-bold" : ""}>{o.label}</Text>
                {o.description ? (
                  <Text tone="muted" variant="bodySm">
                    {o.description}
                  </Text>
                ) : null}
              </Pressable>
            ),
          )}
        </VStack>
      </ScrollView>
    </BottomSheet>
  );
}
