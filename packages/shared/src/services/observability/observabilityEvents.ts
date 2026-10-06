// Central event-name taxonomy. Web and native emit identical names.
// Convention: <domain>.<action>.<outcome>. Add a name here (never inline a
// string at a call site) and add it to the observability-conventions skill.
export const OBSERVABILITY_EVENTS = {
  ONBOARDING_STARTED: 'onboarding.start.begin',
  ONBOARDING_AGE_GATE: 'onboarding.age.gate',
  ONBOARDING_COMPLETED: 'onboarding.complete.success',
  VILLAGE_JOIN_SUCCESS: 'village.join.success',
  VILLAGE_JOIN_ERROR: 'village.join.error',
  EVENT_SIGNUP_SUCCESS: 'event.signup.success',
  EVENT_SIGNUP_ERROR: 'event.signup.error',
  ORG_CREATE_SUCCESS: 'org.create.success',
  ORG_CREATE_ERROR: 'org.create.error',
  CONTENT_DETAIL_VIEWED: 'content.detail.viewed',
  SEARCH_QUERY_SUBMITTED: 'search.query.submitted',
  SEARCH_RESULT_SELECTED: 'search.result.selected',
  ORG_INVITE_SHARED: 'org.invite.shared',
  ORG_JOIN_SUCCESS: 'org.join.success',
  ORG_JOIN_ERROR: 'org.join.error',
  APP_EXCEPTION: 'app.exception.thrown',
  APP_LINK_OPENED: 'app.link.opened',
} as const;

export type ObservabilityEventName =
  (typeof OBSERVABILITY_EVENTS)[keyof typeof OBSERVABILITY_EVENTS];
