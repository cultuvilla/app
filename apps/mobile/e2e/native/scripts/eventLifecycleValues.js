// Maestro runScript — the values flow 60 types and flow 64 edits them to.
//
// Deterministic, not time-stamped: 64 finds 60's event by its title, and two
// flows share nothing but Firestore. 60 deletes any leftover of either title
// before creating, and both require exactly one match.
//
// Dates are two months out, so the calendar has to page and day 20 is never in
// the past; the labels are what the detail screen's date card renders
// (formatDate 'dayMonth' + 'time', es-ES, month capitalised).
var MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
function pad(n) { return (n < 10 ? '0' : '') + n; }

var now = new Date();
var month = new Date(now.getFullYear(), now.getMonth() + 2, 1);
var ym = month.getFullYear() + '-' + pad(month.getMonth() + 1);

output.title = 'Fiesta completa E2E';
output.description = 'Verbena con orquesta y chocolate';
output.editTitle = 'Fiesta editada E2E';
output.editDescription = 'Cambio de planes ahora paella';
output.startDay = ym + '-15';
output.editDay = ym + '-20';
output.editEndDay = ym + '-21';
output.startLabel = '15 de ' + MONTHS[month.getMonth()] + ' · 12:30';
output.editLabel = '20 de ' + MONTHS[month.getMonth()] + ' · 11:00';
