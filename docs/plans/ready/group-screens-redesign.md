# Group screens redesign — what each group button opens

**Priority:** high

Decided 2026-11-12 (Álvaro), from the design review artifact
(https://claude.ai/artifact/2ttqkgDM9ejuzq3qNFFkU7, mockups of every option).
The group home in the Grupos tab stays as it is; this redesigns only the screens
its buttons open. Each part below is independent and lands on its own.

## Decisions

1. **Charla — like WhatsApp.** Consecutive messages from one person grouped
   (name once), day separators, a coloured initial per person, own messages on
   the right without a name. Long-press opens reactions and the options sheet
   (reply, copy, report/block, delete); the per-message "⋮" goes.
2. **Replies and reactions** on Charla messages: reply quoting a message, and
   reactions 👍 ❤️ 😂 😮 🙏. New stored fields on chat messages (expand only;
   older binaries ignore them).
3. **No pinned message** in the Charla — the avisos are for that.
4. **Cosateca — a shop window.** Search box; an "En marcha" strip on top (what
   others ask of you, what you hold and when it goes back), shown only when there
   is something; the catalogue as a two-column photo grid (no photo: a coloured
   tile with the category icon); status as one chip on the photo ("Libre",
   "hasta 18 nov"); the kind said in words on the card ("se reserva",
   "servicio"). The two request tabs collapse into one inbox behind "Todo".
5. **Ofrecer starts with the photo** (camera or gallery), then what it is, then
   how it is shared in sentences ("La presto", "La regalo", "Ofrezco un servicio").
6. **Mi cuota — a receipt.** A big card with the amount, a PENDIENTE/PAGADA
   stamp and the days left; how to pay with copy buttons (Bizum, IBAN,
   concepto); the personas a cargo on it; past payments as year chips.
7. **Actas — a timeline of agreements.** `agreements` grouped by year, with
   search; each opens its acta. No new data.
8. **Socios — your record, the junta, the book.** Your socio number, cuota
   status and personas a cargo (chips, "＋ Hacer socio") on top; join requests as
   a banner for admins; the junta directiva with faces and titles; the book with
   search and filters (Activos · Cuota pendiente · Sin app · Bajas).
9. **Managing a socio is one sheet**: tapping a row opens their record with
   every action, the dangerous ones last and in red. No more links under rows.
10. **The book shows each socio's cuota status to the junta**, with the
    "Cuota pendiente" filter.
11. **Ajustes is the junta's only.** The group's rules, as today's switches
    worded in the positive with no hint text; "Los estatutos permiten ver la
    lista de socios" becomes **"Lista de socios visible"**. A member's own
    notification choices leave the group and live in the user menu
    (Ajustes → Notificaciones).
12. **Notifications per group: three levels** — De todo · Solo avisos y lo que
    me toca · Nada — in Ajustes → Notificaciones, one picker per group.
13. **Cuota (junta) — collection list with a cash-desk mode.** Collected vs
    total with a progress bar; filter chips; a "✓ Pagó" button per socio with the
    amount filled in that asks only how they paid; configure/export/reminders
    behind "⋯"; a "Cobrar en la mesa" mode (search a name, tap the method, a
    running total for the cash box).
14. **Avisos (junta) — reads and poll at a glance.** Each sent aviso shows a
    read bar ("87 de 132"), the poll result and "Recordar a N" without opening it.
15. **Registros — the association's folder.** Three large doors (Libro, Actas,
    Cuentas) each to its own screen, and, ahead of an asamblea, a checklist of
    what is missing with "Exportar todo".
16. **Darker muted text across the app** (contrast ≥ 4.5:1 on cream), as its
    own change.

## Parts

Each lands as its own PR; order is free.

- **Ajustes + notification levels** (11, 12).
- **Charla** (1, 2, 3).
- **Cosateca** (4, 5).
- **Mi cuota** (6).
- **Actas** (7).
- **Socios** (8, 9, 10).
- **Cuota junta** (13).
- **Avisos junta** (14).
- **Registros** (15).
- **Muted text contrast** (16).
