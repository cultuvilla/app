import { Button, Text, VStack } from '../primitives';

export type DevLoginButtonsProps = {
  accounts: string[];
  onSelect: (email: string) => void;
  loadingEmail: string | null;
};

// Dev builds only — AuthContext hands out an empty list anywhere else, so this
// renders nothing. Hardcoded copy is fine here: no real user ever sees it.
export function DevLoginButtons({ accounts, onSelect, loadingEmail }: DevLoginButtonsProps) {
  if (accounts.length === 0) return null;
  return (
    <VStack gap={2}>
      <Text tone="muted" variant="bodySm">
        Dev · entrar como
      </Text>
      {accounts.map((email) => (
        <Button
          key={email}
          variant="ghost"
          onPress={() => onSelect(email)}
          loading={loadingEmail === email}
          fullWidth
          testID={`login-dev-account-${email}`}
        >
          {email}
        </Button>
      ))}
    </VStack>
  );
}
