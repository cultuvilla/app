module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
  },
  // The version-bump commit on a `develop → beta` promotion is a bare semver
  // string (e.g. `0.10.0`), not a conventional commit — see the "Versioning &
  // releases" section of AGENTS.md. Exempt exactly that shape; everything else
  // still goes through config-conventional. `release:cut --breaking` adds
  // exactly one trailer line, which keeps the exemption.
  ignores: [(message) => /^\d+\.\d+\.\d+(\n\nBreaking-Client: [^\n]{1,83})?$/.test(message.trim())],
};
