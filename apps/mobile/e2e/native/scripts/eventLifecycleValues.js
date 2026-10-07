// Maestro runScript — the values flow 60 types and later expects back.
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
var stamp = String(Date.now());

output.title = 'Fiesta completa ' + stamp;
output.description = 'Verbena con orquesta y chocolate ' + stamp;
output.editTitle = 'Fiesta editada ' + stamp;
output.editDescription = 'Cambio de planes ahora paella ' + stamp;
output.startDay = ym + '-15';
output.editDay = ym + '-20';
output.editEndDay = ym + '-21';
output.startLabel = '15 de ' + MONTHS[month.getMonth()] + ' · 12:30';
output.editLabel = '20 de ' + MONTHS[month.getMonth()] + ' · 11:00';
