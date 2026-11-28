- Google Play now shows the version's «Novedades» from the CHANGELOG store notes,
  the same text as the App Store, on the production release and on Cultuvilla
  Beta; `pnpm play:notes:show` reads them back. CI also checks the store listing
  (`docs/store/listing-es-ES.md`) against both stores' limits, and
  `release:cut` refuses store notes over Play's 500 characters. **Migration:** none.
