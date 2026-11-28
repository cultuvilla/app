/**
 * Every string that appears on a Wrapped image. These are image-only strings,
 * kept here as module constants rather than in `@cultuvilla/i18n` (which the
 * read site does consume server-side, through functions/src/web/copy.ts);
 * keeping all of them in one file is what makes them findable.
 *
 * The verbs are deliberate: every figure is a SIGN-UP. `checkedInAt` is never
 * set, so nothing here may say "asistieron".
 */
export const copy = {
  fiestas: 'Fiestas',
  fiestasYear: (year: number) => `Fiestas ${String(year)}`,
  peopleKicker: 'Todo el pueblo',
  peopleTitle: (n: number) => (n === 1 ? '1 vecino' : `${String(n)} vecinos`),
  peopleSubtitle: (n: number) => (n === 1 ? '1 se apuntó a algo' : `${String(n)} se apuntaron a algo`),
  peopleLegendIn: 'Se apuntó',
  peopleLegendOut: 'Aún no',
  eventsKicker: 'Lo que se hizo',
  eventsTitle: (n: number) => (n === 1 ? '1 evento' : `${String(n)} eventos`),
  eventsMore: (n: number) => `y ${String(n)} más`,
  newsKicker: 'Lo que se contó',
  newsTitle: (n: number) => (n === 1 ? '1 artículo' : `${String(n)} artículos`),
  organizersKicker: 'Quién lo hizo posible',
  organizersTitle: 'Gracias',
  organizersOrgs: 'Asociaciones y peñas',
  organizersPeople: 'Organizaron',
  eventCount: (n: number) => (n === 1 ? '1 evento' : `${String(n)} eventos`),
  postersKicker: 'El archivo del pueblo',
  postersTitle: (span: number) =>
    span === 1 ? '1 año de carteles' : span > 0 ? `${String(span)} años de carteles` : 'Los carteles',
  postersAdded: (n: number) =>
    n === 0 ? 'Este año aún no se ha sumado ninguno' : n === 1 ? 'Este año se sumó 1' : `Este año se sumaron ${String(n)}`,
  statsKicker: 'En números',
  statsEvents: 'eventos',
  statsPeople: 'personas se apuntaron',
  statsSignups: 'inscripciones',
  statsComments: 'comentarios',
  statsPerEvent: 'media de personas por evento',
  statsFullest: 'El evento más lleno',
  statsFullestCount: (n: number, cap: number | null) =>
    cap
      ? `${String(n)} de ${String(cap)} ${cap === 1 ? 'plaza' : 'plazas'}`
      : n === 1
        ? '1 apuntado'
        : `${String(n)} apuntados`,
};
