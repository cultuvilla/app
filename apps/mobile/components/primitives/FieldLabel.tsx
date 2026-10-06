import type { ReactNode } from 'react';
import { Text } from './Text';

export interface FieldLabelProps {
  children: ReactNode;
  /** Appends a red asterisk so a mandatory field reads as such before the
   *  form refuses to advance. */
  required?: boolean;
}

// The single source of truth for the label shown above a form field (text
// inputs, date pickers, village/barrio pickers, chip groups). Centralizing it
// here keeps every field label identical — previously each primitive rendered
// its own <Text>, which had drifted (bodySm/muted in Input, body/muted in the
// pickers, plain in Toggle). Darker green (primary/olive) + body size so the
// label reads clearly above its field.
export function FieldLabel({ children, required }: FieldLabelProps) {
  return (
    <Text variant="body" tone="primary" className="font-medium">
      {children}
      {required ? <Text tone="danger"> *</Text> : null}
    </Text>
  );
}
