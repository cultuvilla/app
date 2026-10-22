#!/usr/bin/env bash
# Create the Pub/Sub plumbing of the Telegram alerts in one project.
#
#   pnpm notify:setup <project>            # dry run — prints the plan, writes nothing
#   pnpm notify:setup <project> --apply    # creates what is missing, grants the role
#
# Idempotent: everything is created only when absent and the grant is an
# add-binding, so a re-run changes nothing. Per project:
#
#   topic `notify`                — where publishNotify (functions/src/notify/)
#                                   puts envelopes. The functions runtime (the
#                                   compute default SA, roles/editor) publishes
#                                   without a grant of its own. Dev and beta
#                                   need the topic too, or every alert there
#                                   fails and retries for an hour.
#
# and in cultuvilla-prod only, the end the homelab notify-gateway pulls from:
#
#   subscription `notify-gateway` — pull, 7-day retention, never expires (the
#                                   gateway may be down for days; messages wait)
#   SA notify-gateway-subscriber  — roles/pubsub.subscriber on that subscription
#                                   and nothing else (no project role, so
#                                   infra/env-parity.json is unchanged). Its key
#                                   is NOT created here: the user creates it and
#                                   hands it to homelab through store_secret.py
#                                   / sops, never pasted.
#
# Running it against cultuvilla-prod is the user's call (AGENTS.md § Approval).
set -euo pipefail

PROJECT="${1:-}"
APPLY=false
[[ "${2:-}" == "--apply" ]] && APPLY=true
if [[ -z "$PROJECT" || "$PROJECT" == -* ]]; then
  sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi
case "$PROJECT" in
  cultuvilla-prod|cultuvilla-beta|villa-events) ;;
  *) echo "✗ Unknown project '$PROJECT' (cultuvilla-prod | cultuvilla-beta | villa-events)" >&2; exit 2 ;;
esac

# Every call names its account rather than trusting the active configuration,
# which is global state another session can change under this one.
ACCOUNT="${GCLOUD_ACCOUNT:-cultuvilla.app@gmail.com}"
gc() { gcloud --account="$ACCOUNT" --project="$PROJECT" --quiet "$@"; }

TOPIC=notify
SUBSCRIPTION=notify-gateway
SUBSCRIBER_SA_NAME=notify-gateway-subscriber
SUBSCRIBER_SA="${SUBSCRIBER_SA_NAME}@${PROJECT}.iam.gserviceaccount.com"

act() {
  local what="$1"; shift
  if [[ "$APPLY" == true ]]; then
    echo "  ▶ $what"
    "$@" >/dev/null
  else
    echo "  · $what"
  fi
}

echo "Project: $PROJECT (as $ACCOUNT)$([[ "$APPLY" == true ]] || echo ' — dry run, nothing is written')"

if gc pubsub topics describe "$TOPIC" >/dev/null 2>&1; then
  echo "  = topic $TOPIC exists"
else
  act "create topic $TOPIC" gc pubsub topics create "$TOPIC"
fi

if [[ "$PROJECT" == cultuvilla-prod ]]; then
  if gc pubsub subscriptions describe "$SUBSCRIPTION" >/dev/null 2>&1; then
    echo "  = subscription $SUBSCRIPTION exists"
  else
    act "create pull subscription $SUBSCRIPTION (7-day retention, never expires)" \
      gc pubsub subscriptions create "$SUBSCRIPTION" --topic="$TOPIC" \
        --ack-deadline=60 --message-retention-duration=7d --expiration-period=never
  fi

  if gc iam service-accounts describe "$SUBSCRIBER_SA" >/dev/null 2>&1; then
    echo "  = service account $SUBSCRIBER_SA exists"
  else
    act "create service account $SUBSCRIBER_SA" \
      gc iam service-accounts create "$SUBSCRIBER_SA_NAME" --display-name="notify-gateway (homelab) — pulls notify-gateway"
  fi

  act "grant roles/pubsub.subscriber on $SUBSCRIPTION to $SUBSCRIBER_SA" \
    gc pubsub subscriptions add-iam-policy-binding "$SUBSCRIPTION" \
      --member="serviceAccount:$SUBSCRIBER_SA" --role=roles/pubsub.subscriber
fi

echo
if [[ "$APPLY" == true ]]; then
  echo "✓ Done."
else
  echo "Re-run with --apply to write these."
fi
