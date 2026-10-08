#!/usr/bin/env bash
#
# Provision keyless CI deploy auth for the three Firebase environments.
#
# For each project (villa-events/dev, cultuvilla-beta/beta, cultuvilla-prod/prod)
# this creates a `gha-deployer` service account with Firebase deploy roles, a
# `github-actions` Workload Identity pool + `github` OIDC provider that trusts
# ONLY this GitHub repo, and a branch-scoped impersonation binding. No SA keys
# are ever created. Idempotent — safe to re-run.
#
# Prerequisite:
#   - gcloud authenticated as an Owner/IAM-admin of all three projects:
#       gcloud auth login cultuvilla.app@gmail.com
#   (this script enables every required deploy API itself — see DEPLOY_APIS.)
#
# After running, set the printed WIF provider + SA email as GitHub Environment
# variables GCP_WIF_PROVIDER / GCP_SERVICE_ACCOUNT (dev/beta/production).
set -euo pipefail

ACC=cultuvilla.app@gmail.com
REPO="cultuvilla/app"
OWNER="cultuvilla"
POOL="github-actions"
PROVIDER="github"
SA_ID="gha-deployer"

# project_id : project_number : branch
TRIPLES=(
  "villa-events:790546266005:develop"
  "cultuvilla-beta:336400380436:beta"
  "cultuvilla-prod:34340110439:main"
)

# Deploy APIs each project needs (functions v2 pulls in run/eventarc/build/
# artifactregistry; secrets/scheduler/billing are needed by our specific
# functions and the CLI's Blaze-plan check).
DEPLOY_APIS=(
  iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com
  cloudresourcemanager.googleapis.com serviceusage.googleapis.com
  firebasehosting.googleapis.com firebaserules.googleapis.com firestore.googleapis.com
  cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
  run.googleapis.com eventarc.googleapis.com pubsub.googleapis.com
  secretmanager.googleapis.com cloudscheduler.googleapis.com cloudbilling.googleapis.com
)

SA_ROLES=(
  roles/firebase.admin
  roles/firebasehosting.admin
  roles/firebaserules.admin
  roles/datastore.owner
  roles/cloudfunctions.admin
  roles/run.admin
  roles/artifactregistry.admin
  roles/eventarc.admin
  roles/cloudbuild.builds.editor
  roles/pubsub.admin
  # functions read GOOGLE_MAPS_API_KEY from Secret Manager; the CLI grants the
  # runtime SA access at deploy time (needs setIamPolicy on the secret).
  roles/secretmanager.admin
  # scheduled functions (completeExpiredEvents) create/update Cloud Scheduler jobs.
  roles/cloudscheduler.admin
  roles/iam.serviceAccountUser
  # read-only IAM inspection for the pre-deploy custom-token signing gate
  # (scripts/check-custom-token-signing.mjs needs serviceAccounts.getIamPolicy).
  roles/iam.serviceAccountViewer
  roles/serviceusage.serviceUsageConsumer
  # read-only, for the parity gate (scripts/check-env-parity.mjs): the
  # project IAM policy and the list of enabled APIs.
  roles/iam.securityReviewer
  roles/serviceusage.serviceUsageViewer
)

g() { gcloud "$@" --account="$ACC" --quiet; }

# retry a command up to N times; gcloud round-trips (~1-2s) provide the backoff
# needed for IAM eventual consistency after SA creation.
retry() {
  local n=0 max=30
  until "$@" >/dev/null 2>&1; do
    n=$((n+1))
    if [ "$n" -ge "$max" ]; then
      echo "  !! failed after $max attempts: $*" >&2
      "$@"  # run once more unsuppressed to surface the error
      return 1
    fi
  done
}

# block until the SA is visible to IAM (propagation can lag after create)
wait_for_sa() {
  local email="$1" project="$2"
  retry g iam service-accounts describe "$email" --project="$project"
}

for T in "${TRIPLES[@]}"; do
  IFS=: read -r PROJECT NUMBER BRANCH <<<"$T"
  SA_EMAIL="${SA_ID}@${PROJECT}.iam.gserviceaccount.com"
  echo "############################################################"
  echo "# $PROJECT (num $NUMBER) → branch '$BRANCH'"
  echo "############################################################"

  # 0) enable the deploy APIs (idempotent)
  g services enable "${DEPLOY_APIS[@]}" --project="$PROJECT" >/dev/null
  echo "  APIs enabled (${#DEPLOY_APIS[@]})"

  # 1) deployer service account (keyless)
  if g iam service-accounts describe "$SA_EMAIL" --project="$PROJECT" >/dev/null 2>&1; then
    echo "  SA exists: $SA_EMAIL"
  else
    g iam service-accounts create "$SA_ID" --project="$PROJECT" \
      --display-name="GitHub Actions deployer ($BRANCH)"
    echo "  SA created: $SA_EMAIL"
  fi

  # 2) grant deploy roles (idempotent; retry through IAM propagation lag)
  wait_for_sa "$SA_EMAIL" "$PROJECT"
  for R in "${SA_ROLES[@]}"; do
    retry g projects add-iam-policy-binding "$PROJECT" \
      --member="serviceAccount:${SA_EMAIL}" --role="$R" --condition=None
  done
  echo "  roles granted (${#SA_ROLES[@]})"

  # 3) workload identity pool
  if g iam workload-identity-pools describe "$POOL" --project="$PROJECT" --location=global >/dev/null 2>&1; then
    echo "  pool exists: $POOL"
  else
    g iam workload-identity-pools create "$POOL" --project="$PROJECT" --location=global \
      --display-name="GitHub Actions"
    echo "  pool created: $POOL"
  fi

  # 4) OIDC provider (trusts only this repo). The impersonation binding below is
  #    scoped by branch alone, so this condition is the only thing keeping another
  #    repo's `develop` from deploying as this SA — the private cultuvilla/business
  #    repo deliberately has its own provider (`github-business`) for that reason.
  #    Creation only: to change the condition on an existing provider, run
  #    `gcloud iam workload-identity-pools providers update-oidc` with the same flag.
  if g iam workload-identity-pools providers describe "$PROVIDER" \
       --project="$PROJECT" --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1; then
    echo "  provider exists: $PROVIDER"
  else
    g iam workload-identity-pools providers create-oidc "$PROVIDER" \
      --project="$PROJECT" --location=global --workload-identity-pool="$POOL" \
      --display-name="GitHub" \
      --issuer-uri="https://token.actions.githubusercontent.com" \
      --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref" \
      --attribute-condition="assertion.repository_owner=='${OWNER}' && assertion.repository=='${REPO}'"
    echo "  provider created: $PROVIDER"
  fi

  # 5) allow the repo's <branch> pushes to impersonate the SA
  MEMBER="principalSet://iam.googleapis.com/projects/${NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.ref/refs/heads/${BRANCH}"
  g iam service-accounts add-iam-policy-binding "$SA_EMAIL" --project="$PROJECT" \
    --role="roles/iam.workloadIdentityUser" \
    --member="$MEMBER" >/dev/null
  echo "  impersonation bound: refs/heads/${BRANCH} → $SA_EMAIL"

  echo "  WIF provider resource:"
  echo "    projects/${NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"
  echo
done
echo "ALL DONE"
