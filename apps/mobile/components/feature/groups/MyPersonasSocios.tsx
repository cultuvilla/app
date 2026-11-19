import { useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  buildNameWithNickname,
  isDeceased,
  type PersonData,
} from "@cultuvilla/shared/models/person";
import { isActiveSocio } from "@cultuvilla/shared/models/organization";
import { colors, iconSizes } from "@cultuvilla/shared/design-system";
import { watchPersonsByCreator } from "@cultuvilla/shared/services/personService";
import {
  addPersonaSocio,
  setSocioBaja,
  watchMySocios,
  type Socio,
} from "@cultuvilla/shared/services/socioService";
import {
  BottomSheet,
  Button,
  HStack,
  Pressable,
  Text,
  VStack,
} from "../../primitives";
import { useWatch } from "../../../lib/hooks/useWatch";
import { personHref } from "../../../lib/navigation/routes";
import { useT } from "../../../lib/i18n";
import { showAlert, showConfirm } from "../../../lib/dialogs";

type Person = PersonData & { id: string };

/** The member's personas a cargo (people they created with no account of their own), and which are socios here. */
function usePersonasSocios(orgId: string, uid: string) {
  const persons = useWatch<Person[]>(
    "groups:watchPersonsByCreator",
    uid,
    (next, error) => watchPersonsByCreator(uid, uid, next, error),
  );
  const mine = useWatch<Socio[]>(
    "groups:watchMySocios",
    `${orgId}|${uid}`,
    (next, error) => watchMySocios(orgId, uid, next, error),
  );
  const personas = useMemo(
    () =>
      (persons.data ?? []).filter((p) => p.userId === null && !isDeceased(p)),
    [persons.data],
  );
  const rowByPerson = useMemo(
    () =>
      new Map(
        (mine.data ?? [])
          .filter((s) => s.kind === "persona" && isActiveSocio(s) && s.personId)
          .map((s) => [s.personId, s]),
      ),
    [mine.data],
  );
  return {
    ready: persons.status === "ready" && mine.status === "ready",
    personas,
    rowByPerson,
  };
}

const fullName = (p: Person) => buildNameWithNickname(p).trim();

/**
 * On the member's ficha: their personas a cargo who are socios, as chips that
 * carry the number and offer the baja. Nothing when none is.
 */
export function MyPersonasSocios({
  orgId,
  uid,
}: {
  orgId: string;
  uid: string;
}) {
  const { t } = useT();
  const { ready, personas, rowByPerson } = usePersonasSocios(orgId, uid);
  const [busy, setBusy] = useState<string | null>(null);
  const socios = personas.flatMap((p) => {
    const row = rowByPerson.get(p.id);
    return row ? [{ p, row }] : [];
  });
  if (!ready || socios.length === 0) return null;

  return (
    <View testID="my-personas-socios" className="flex-row flex-wrap gap-2">
      {socios.map(({ p, row }) => {
        const name = fullName(p);
        const short = p.givenName.trim() || name;
        return (
          <Chip
            key={p.id}
            testID={`persona-socio-remove-${p.id}`}
            busy={busy === p.id}
            label={
              row.socioNumber !== null
                ? t("groups.personas.chipSocio", {
                    name: short,
                    number: String(row.socioNumber),
                  })
                : short
            }
            icon="checkmark-circle"
            onPress={() =>
              showConfirm(
                t("groups.personas.confirmRemoveTitle"),
                t("groups.personas.confirmRemoveBody", { name }),
                () => {
                  setBusy(p.id);
                  setSocioBaja(orgId, row)
                    .catch(() => showAlert(t("groups.personas.error")))
                    .finally(() => setBusy(null));
                },
                {
                  confirmText: t("groups.personas.remove"),
                  cancelText: t("common.cancel"),
                },
              )
            }
          />
        );
      })}
    </View>
  );
}

/**
 * Below the ficha, one button to make a persona a cargo a socio (decided
 * 2026-11-19, user): it opens a sheet to pick who, or to add a new persona.
 * With nobody left to pick it goes straight to adding one.
 */
export function AddPersonaSocio({
  orgId,
  uid,
}: {
  orgId: string;
  uid: string;
}) {
  const { t } = useT();
  const { ready, personas, rowByPerson } = usePersonasSocios(orgId, uid);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  if (!ready) return null;
  const pickable = personas.filter((p) => !rowByPerson.has(p.id));

  const addNew = () => {
    setOpen(false);
    router.push(personHref("new"));
  };
  const pick = (p: Person) => {
    setBusy(p.id);
    addPersonaSocio(orgId, { id: p.id, displayName: fullName(p) }, uid)
      .then(() => setOpen(false))
      .catch(() => showAlert(t("groups.personas.error")))
      .finally(() => setBusy(null));
  };

  return (
    <View className="items-center">
      <Button
        variant="secondary"
        testID="persona-socio-add"
        onPress={() => (pickable.length > 0 ? setOpen(true) : addNew())}
      >
        {t("groups.personas.add")}
      </Button>
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={t("groups.personas.pickTitle")}
        closeLabel={t("common.close")}
        testID="persona-socio-sheet"
      >
        <VStack gap={1}>
          {pickable.map((p) => (
            <Pressable
              key={p.id}
              testID={`persona-socio-pick-${p.id}`}
              accessibilityRole="button"
              accessibilityState={{ busy: busy === p.id }}
              disabled={busy !== null}
              onPress={() => pick(p)}
              className={`py-3 ${busy === p.id ? "opacity-50" : ""}`}
            >
              <Text>{fullName(p)}</Text>
            </Pressable>
          ))}
          <Pressable
            testID="persona-socio-new"
            accessibilityRole="button"
            onPress={addNew}
            className="py-3"
          >
            <HStack gap={2} align="center">
              <Ionicons
                name="add"
                size={iconSizes.md}
                color={colors.light.fg.accent}
              />
              <Text className="text-accent font-medium">
                {t("groups.personas.new")}
              </Text>
            </HStack>
          </Pressable>
        </VStack>
      </BottomSheet>
    </View>
  );
}

function Chip({
  label,
  icon,
  accent = false,
  busy = false,
  onPress,
  testID,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  accent?: boolean;
  busy?: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ busy }}
      disabled={busy}
      onPress={onPress}
      className={`rounded-full px-3 py-1 border ${accent ? "border-accent" : "border-subtle bg-surface"} ${busy ? "opacity-50" : ""}`}
    >
      <HStack gap={1} align="center">
        {icon ? (
          <Ionicons
            name={icon}
            size={iconSizes.sm}
            color={accent ? colors.light.fg.accent : colors.light.fg.success}
          />
        ) : null}
        <Text
          variant="bodySm"
          className={accent ? "text-accent font-medium" : "font-medium"}
        >
          {label}
        </Text>
      </HStack>
    </Pressable>
  );
}
