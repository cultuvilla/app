# Branded authentication email delivery

**Priority:** medium

## Goal

Replace Firebase's built-in passwordless email with a Cultuvilla-owned Spanish
email that has reliable branding, delivery controls, and the same secure
email-link authentication semantics.

## Context

Cultuvilla uses one Firebase passwordless email-link flow for both first-time
registration and returning sign-in. The client explicitly requests Spanish, but
Firebase owns the message markup and delivery. Its supported project
configuration exposes the default locale and project display name, but not a
separate editable HTML template for the passwordless sign-in email. That means
the built-in flow cannot reliably carry the Cultuvilla logo, an email-safe branded
button, custom explanatory copy, or a branded footer.

The quick configuration applied to development on 2026-07-18 is the practical
ceiling of the built-in flow:

- Firebase Auth default locale: `es`.
- Google Cloud project display name: `Cultuvilla`, which supplies the app name in
  Firebase's generated email.
- The app already sets `auth.languageCode = 'es'` before every operation that
  generates an authentication email.
- No logo or custom HTML was added because the supported passwordless template
  surface does not expose them.
- Beta and production project configuration were not changed; those environments
  continue to rely on the client-requested Spanish locale until a deliberate
  rollout is approved.

## Design / approach

### Delivery boundary

Replace the client's `sendSignInLinkToEmail` call with a narrowly scoped callable
Cloud Function. The callable generates the sign-in URL with the Firebase Admin
SDK's `generateSignInWithEmailLink`, renders both HTML and plain-text variants,
and sends them through a transactional email provider.

The mobile app must still route the request through the shared service layer;
`AuthContext` remains the authentication boundary and stores the pending email
only after the callable succeeds. Link completion remains unchanged:
`isSignInWithEmailLink` followed by `signInWithEmailLink` on `/finish`.

### Email content

Use generic access wording because Firebase does not know whether the address is
creating an account or returning until the link is redeemed:

- Subject includes “Cultuvilla” and a timestamp so repeated access emails do not
  collapse into a thread that hides the newest link.
- Cultuvilla logo with useful alt text, served from a stable HTTPS URL under the
  branded domain.
- Short Spanish explanation and a prominent “Entrar en Cultuvilla” button.
- Visible fallback URL for clients that block buttons or styles.
- Security note explaining that the recipient can ignore an unrequested email.
- Minimal legal/support footer; no tracking pixel.
- Table-based, inline-styled email markup tested on narrow mobile widths, Gmail,
  Apple Mail, and Outlook, plus a complete plain-text alternative.

### Provider and domain

Use a transactional provider such as Postmark, Resend, or SendGrid. Send from a
dedicated subdomain (for example `acceso.cultuvilla.es`) so authentication mail has
its own SPF/DKIM reputation while visible links remain on `cultuvilla.es`.
Configure SPF, DKIM, and DMARC before production rollout. Store provider
credentials in Secret Manager independently for dev, beta, and production.

Development should use the provider's sandbox/test mode or an explicit recipient
allowlist so automated and manual testing cannot email arbitrary addresses.

### Abuse and privacy controls

The callable is unauthenticated by necessity, so it must retain the protections
that Firebase's managed sender currently provides:

- Validate and normalize the email without revealing whether an account exists.
- Return the same success-shaped response for new and existing addresses.
- Rate-limit by a server-derived IP bucket and a one-way email-address bucket.
- Never write raw email addresses, sign-in links, or one-time codes to logs.
- Use structured Cloud Function logging with a `handler` field and non-PII result
  metadata.
- Bind App Check when the product activates the existing App Check seam; do not
  make App Check a prerequisite for the initial web-first rollout.

### Verification and rollout

Add unit tests for Spanish HTML/plain-text rendering, link placement, escaping,
logo alt text, and required security copy. Add callable tests with the Admin link
generator and provider transport mocked, including rate-limit and generic-response
cases. Preserve the existing email-link Auth emulator round trip for redemption.

Roll out dev first with a test sender, then beta with DNS-authenticated delivery,
then production after inbox checks in Gmail, Outlook, and Apple Mail. Keep the
Firebase-managed sender available as a rollback path until provider delivery and
bounce handling are proven.

## Open questions

- Which transactional provider should Cultuvilla standardize on, and what are its
  EU data-processing and data-residency terms?
- Which sender address and subdomain should be visible to recipients?
- Who owns the final Spanish copy and visual approval?
- What concrete per-IP and per-address rate limits balance abuse prevention with
  legitimate repeated requests?
- Should a separate welcome email be sent only after the first successful link
  redemption, or is the onboarding screen sufficient?
- Should the action link move from the Firebase Hosting domain to a branded Auth
  link domain in the same rollout?
- What bounce/complaint suppression policy should block repeated sends to bad
  addresses without storing unnecessary personal data?

## References

- [Firebase: generate email action links](https://firebase.google.com/docs/auth/admin/email-action-links)
- [Firebase: email-link authentication](https://firebase.google.com/docs/auth/web/email-link-auth)
- [Identity Platform project email configuration](https://cloud.google.com/identity-platform/docs/reference/rest/v2/Config)
