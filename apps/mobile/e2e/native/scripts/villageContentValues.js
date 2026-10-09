// Maestro runScript — the values the village-content flows (80–84) type and
// edit to.
//
// Deterministic, not time-stamped: each flow deletes any leftover of its
// titles before creating, then requires exactly one match.
//
// Poster days sit next month, so the calendar has to page once; the labels are
// what the poster detail renders (formatDate 'dayMonth', es-ES, month
// capitalised, then the poster's year).
var MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
function pad(n) { return (n < 10 ? '0' : '') + n; }

var now = new Date();
var month = new Date(now.getFullYear(), now.getMonth() + 1, 1);
var ym = month.getFullYear() + '-' + pad(month.getMonth() + 1);
var monthName = MONTHS[month.getMonth()];

output.newsTitle = 'Noticia completa E2E';
output.newsEditTitle = 'Noticia editada E2E';
output.newsText = 'Texto de la noticia escrito por Maestro';
output.newsEditText = 'Texto cambiado al editar';
output.newsCaption = 'Pie de foto E2E';
output.newsEditCaption = 'Pie de foto editado';

output.placeName = 'Ermita completa E2E';
output.placeEditName = 'Ermita editada E2E';
output.placeDescription = 'Ermita del siglo XVI en el cerro';
output.placeEditDescription = 'Restaurada en 1990 por los vecinos';

output.barrioName = 'Barrio completo E2E';
output.barrioEditName = 'Barrio editado E2E';

output.posterTitle = 'Cartel completo E2E';
output.posterEditTitle = 'Cartel editado E2E';
output.posterYear = '1987';
output.posterEditYear = '1992';
output.posterStartDay = ym + '-10';
output.posterEndDay = ym + '-12';
output.posterEditEndDay = ym + '-14';
output.posterLabel = '10 de ' + monthName + ' – 12 de ' + monthName + ' 1987';
output.posterEditLabel = '10 de ' + monthName + ' – 14 de ' + monthName + ' 1992';

output.historyTitle = 'Fundación completa E2E';
output.historyEditTitle = 'Fundación editada E2E';
output.historyBody = 'Los primeros pobladores llegaron del valle';
output.historyEditBody = 'Llegaron en realidad desde la sierra';
output.historySources = 'Archivo municipal de Altozano';
output.historyEditSources = 'Archivo diocesano';
output.historyCaption = 'Foto del archivo E2E';
output.historyEditCaption = 'Foto cedida por un vecino';
