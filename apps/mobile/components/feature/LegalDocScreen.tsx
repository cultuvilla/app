import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Text, VStack } from '../primitives';
import { ScreenHeader } from '../layout/ScreenHeader';
import type { LegalDoc } from '@cultuvilla/shared/legal';

function Paragraph({ text }: { text: string }) {
  const isBullet = text.startsWith('•');
  return (
    <Text variant="body" className={isBullet ? 'pl-3' : undefined}>
      {text}
    </Text>
  );
}

export function LegalDocScreen({ doc }: { doc: LegalDoc }) {
  const insets = useSafeAreaInsets();
  return (
    <Screen padded={false} bottomInset={false} topInset={false}>
      <ScreenHeader accent title={doc.title} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: insets.bottom + 24 }}
      >
        <Text variant="bodySm" tone="muted">
          {`Versión ${doc.version} · Última actualización: ${doc.updated}`}
        </Text>
        <VStack gap={2}>
          {doc.intro.map((p, i) => (
            <Paragraph key={i} text={p} />
          ))}
        </VStack>
        <VStack gap={6}>
          {doc.sections.map((section) => (
            <VStack key={section.heading} gap={2}>
              <Text variant="h3">{section.heading}</Text>
              {section.body.map((p, i) => (
                <Paragraph key={i} text={p} />
              ))}
            </VStack>
          ))}
        </VStack>
      </ScrollView>
    </Screen>
  );
}
