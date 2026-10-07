import type { ReactNode } from 'react';
import { VStack, HStack, Text, Button, Input, Pressable, FieldLabel } from '../../primitives';
import { MultiImagePickerRow } from '../MultiImagePickerRow';
import { useT } from '../../../lib/i18n';

export interface ProposableTypeOption {
  value: string;
  label: string;
}

export interface ProposableFormProps {
  /** Already-uploaded image URLs, in order — `images[0]` is the hero/cover. */
  images: string[];
  /** Parent picks + uploads (mirroring FestivalPostersManager.addImage) and
   * appends the returned URL to `images`. */
  onAddImage: () => void;
  onRemoveImage: (index: number) => void;
  /** Loading state for the picker's "+" tile while an upload is in flight. */
  addingImage?: boolean;
  imageLabels?: { add: string; remove: string };
  imagesTestID?: string;

  name: string;
  onChangeName: (value: string) => void;
  nameLabel: string;
  nameTestID?: string;

  /** Omit description entirely (e.g. barrios) by leaving onChangeDescription unset. */
  description?: string;
  onChangeDescription?: (value: string) => void;
  descriptionLabel?: string;
  descriptionTestID?: string;

  /** Chip type-picker. Omit (leave options unset) for entities without a type. */
  typeLabel?: string;
  typeOptions?: ProposableTypeOption[];
  typeValue?: string;
  onChangeType?: (value: string) => void;
  /** Each chip is `<prefix>-<value>`. */
  typeTestIDPrefix?: string;

  /** Extra content rendered at the end of the form, just above the submit
   * button (e.g. the agrupación members-visibility toggle). */
  footer?: ReactNode;

  submitLabel: string;
  submitTestID?: string;
  onSubmit: () => void;
  saving: boolean;
  disabled: boolean;
  /** Omit the built-in submit button — used when a parent Stepper owns the
   * primary action instead (see PlacesManager). */
  hideSubmit?: boolean;
}

/**
 * Standardized "Añadir X" form shared by the Lugares, Barrios and Agrupaciones
 * proposable surfaces. Layout, top-to-bottom: prominent multi-image picker
 * row (first, so the photos lead) → name → optional description → optional
 * type chips → submit. The "Añadir X" title is the screen header, so it is
 * not repeated inside the form. Each field shows its name as a top label
 * (matching PersonForm). The selected type chip uses a light-orange fill.
 *
 * The form only renders the picker row — the parent (a manager or edit
 * screen) owns picking and uploading, mirroring FestivalPostersManager, so it
 * hands back already-uploaded URLs through `onAddImage`/`onRemoveImage`
 * rather than raw picked blobs.
 */
export function ProposableForm({
  images,
  onAddImage,
  onRemoveImage,
  addingImage,
  imageLabels,
  imagesTestID,
  name,
  onChangeName,
  nameLabel,
  nameTestID,
  description,
  onChangeDescription,
  descriptionLabel,
  descriptionTestID,
  typeLabel,
  typeOptions,
  typeValue,
  onChangeType,
  typeTestIDPrefix,
  footer,
  submitLabel,
  submitTestID,
  onSubmit,
  saving,
  disabled,
  hideSubmit,
}: ProposableFormProps) {
  const { t } = useT();
  const showDescription = onChangeDescription !== undefined;
  const showTypes = !!typeOptions && typeOptions.length > 0 && onChangeType !== undefined;

  return (
    <VStack gap={3}>
      <VStack gap={1} align="start">
        <FieldLabel>{t('common.photo')}</FieldLabel>
        <MultiImagePickerRow
          uris={images}
          onAddPress={onAddImage}
          onRemove={onRemoveImage}
          adding={addingImage}
          addLabel={imageLabels?.add ?? ''}
          removeLabel={imageLabels?.remove ?? ''}
          testID={imagesTestID}
        />
      </VStack>

      <Input
        testID={nameTestID}
        value={name}
        onChangeText={onChangeName}
        label={nameLabel}
      />

      {showDescription ? (
        <Input
          value={description ?? ''}
          onChangeText={onChangeDescription}
          label={descriptionLabel}
          multiline
          testID={descriptionTestID}
        />
      ) : null}

      {showTypes ? (
        <VStack gap={1}>
          {typeLabel ? <FieldLabel>{typeLabel}</FieldLabel> : null}
          <HStack gap={2} className="flex-wrap">
            {typeOptions!.map((opt) => {
              const selected = opt.value === typeValue;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => onChangeType!(opt.value)}
                  testID={typeTestIDPrefix ? `${typeTestIDPrefix}-${opt.value}` : undefined}
                  className={`px-3 py-1 rounded-full border ${
                    selected ? 'bg-[#f3a64b] border-[#f3a64b]' : 'border-subtle'
                  }`}
                >
                  <Text className={selected ? 'text-primary' : undefined}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </HStack>
        </VStack>
      ) : null}

      {footer}

      {hideSubmit ? null : (
        <Button testID={submitTestID} onPress={onSubmit} loading={saving} disabled={disabled}>
          {submitLabel}
        </Button>
      )}
    </VStack>
  );
}
