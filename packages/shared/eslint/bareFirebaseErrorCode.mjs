// A Firebase error code read straight off the error — `error.code ===
// 'permission-denied'` — matches the JS SDK the emulator tests run on, and
// never the device: `@react-native-firebase` reports `firestore/permission-denied`
// (and the JS SDK, in turn, `functions/not-found` for a callable). The branch is
// green in every suite and dead in the app. `firebaseErrorCode()` strips the
// prefix, so compare what it returns — against the bare code, since a prefixed
// literal can never equal it.
//
// Ported from Órdago. Shared by every workspace's ESLint config, so they cannot
// drift; pinned by packages/shared/test/eslint/appLintRules.test.ts.

export const LINTED_FIREBASE_ERROR_CODES = [
  'cancelled',
  'unknown',
  'invalid-argument',
  'deadline-exceeded',
  'not-found',
  'already-exists',
  'permission-denied',
  'resource-exhausted',
  'failed-precondition',
  'aborted',
  'out-of-range',
  'unimplemented',
  'internal',
  'unavailable',
  'data-loss',
  'unauthenticated',
];

const CODES = LINTED_FIREBASE_ERROR_CODES.join('|');
// Only the services whose codes are gRPC's: `auth/…` and `storage/…` codes are
// their own vocabulary, so `auth/cancelled` is not `cancelled`.
const ANY_CODE = `/^((firestore|functions)[/])?(${CODES})$/`;
const PREFIXED_CODE = `/^(firestore|functions)[/](${CODES})$/`;

const rawCode = (side) =>
  [
    `[${side}.property.name='code']`,
    `[${side}.property.value='code']`,
    `[${side}.expression.property.name='code']`,
  ].join(', ');
const helperCode = (side) => `[${side}.callee.name='firebaseErrorCode']`;

const compare = (codeAt, literalAt, codeSide, literal) =>
  `BinaryExpression[operator=/^[!=]==?$/][${literalAt}.value=${literal}]:matches(${codeSide(codeAt)})`;

const switchCase = (codeSide, literal) =>
  `SwitchStatement:matches(${codeSide('discriminant')}) > SwitchCase[test.value=${literal}]`;

// `['unavailable', …].includes(error.code)` — an inline list only.
const membership = `CallExpression[callee.property.name=/^(includes|has)$/]:matches(${rawCode('arguments.0')}):has(Literal[value=${ANY_CODE}])`;

export const BARE_FIREBASE_ERROR_CODE_COMPARE = {
  selector: [
    compare('left', 'right', rawCode, ANY_CODE),
    compare('right', 'left', rawCode, ANY_CODE),
    compare('left', 'right', helperCode, PREFIXED_CODE),
    compare('right', 'left', helperCode, PREFIXED_CODE),
    switchCase(rawCode, ANY_CODE),
    switchCase(helperCode, PREFIXED_CODE),
    membership,
  ].join(', '),
  message:
    "Compare a Firebase error code as firebaseErrorCode(error) === 'permission-denied' (@cultuvilla/shared/firebase/sdk/errors): the two SDKs prefix codes differently, so a raw `.code` compare matches only one of them.",
};
