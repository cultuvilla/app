import { describe, it, expect } from 'vitest';
import {
  groupMessagePlaceholdersIn,
  groupMessageRecipientValues,
  NEUTRAL_PERSONAL_VALUES,
  personalizeGroupMessage,
  renderGroupMessageText,
} from '../../src/models/organization/groupMessagePlaceholders';

const ANA = { nombre: 'Ana Pérez', numero: 57, cuotaCents: 3000 };
const BODY = 'Hola {nombre},\n\nLa cena es el sábado.\n\nTu nº de socio es el {nº socio}.\nTienes pendiente {cuota pendiente}.\n\nUn saludo';

describe('group message placeholders', () => {
  it('finds the tokens, forgiving case, accents and spaces, and ignores other braces', () => {
    expect([...groupMessagePlaceholdersIn('{Nombre} {NÚMERO} { cuota } {otro}')]).toEqual(['nombre', 'numero', 'cuota']);
    expect([...groupMessagePlaceholdersIn('{n socio} {numero de socio} {nº socio}')]).toEqual(['numero']);
    expect(groupMessagePlaceholdersIn('sin nada {x}').size).toBe(0);
  });

  it("puts one recipient's values in place", () => {
    expect(renderGroupMessageText(BODY, ANA)).toMatch(
      /^Hola Ana Pérez,\n\nLa cena es el sábado\.\n\nTu nº de socio es el 57\.\nTienes pendiente 30,00\s€\.\n\nUn saludo$/,
    );
  });

  it('renders neutrally: the name drops from its sentence, personal lines go', () => {
    expect(renderGroupMessageText(BODY, NEUTRAL_PERSONAL_VALUES)).toBe('Hola,\n\nLa cena es el sábado.\n\nUn saludo');
    expect(renderGroupMessageText('¡Hola {nombre}!', NEUTRAL_PERSONAL_VALUES)).toBe('¡Hola!');
    expect(renderGroupMessageText('{nombre}, te escribimos', NEUTRAL_PERSONAL_VALUES)).toBe('te escribimos');
    expect(renderGroupMessageText('Hola, {nombre}:', NEUTRAL_PERSONAL_VALUES)).toBe('Hola:');
  });

  it('a missing value of one recipient is rendered neutrally too', () => {
    expect(renderGroupMessageText(BODY, { nombre: 'Luis', numero: null, cuotaCents: null })).toBe(
      'Hola Luis,\n\nLa cena es el sábado.\n\nUn saludo',
    );
  });

  it('a title never loses its line', () => {
    expect(renderGroupMessageText('Cuota de {nombre}: {cuota}', NEUTRAL_PERSONAL_VALUES, 'title')).toBe('Cuota de:');
    expect(renderGroupMessageText('Cuota {cuota}', ANA, 'title')).toMatch(/^Cuota 30,00\s€$/);
  });

  it('leaves a text without tokens exactly as written', () => {
    const text = 'Hola a todos ,  sin cambios {otro}\n\n\n\nfin';
    expect(renderGroupMessageText(text, NEUTRAL_PERSONAL_VALUES)).toBe(text);
  });

  it('personalizes title and body together', () => {
    expect(personalizeGroupMessage({ title: 'Hola {nombre}', body: 'Nº {numero}', x: 1 }, ANA)).toEqual({ title: 'Hola Ana Pérez', body: 'Nº 57', x: 1 });
  });

  it("a household: the holder's own name and number, what all its rows still owe", () => {
    const statuses = [
      { socioId: 'ana', status: 'pendiente' as const, owedCents: 3000, paidCents: 1000 },
      { socioId: 'hija', status: 'vencida' as const, owedCents: 1500, paidCents: 0 },
      { socioId: 'otro', status: 'pendiente' as const, owedCents: 3000, paidCents: 0 },
      { socioId: 'nieto', status: 'al_dia' as const, owedCents: 0, paidCents: 0 },
    ];
    expect(groupMessageRecipientValues({ holderName: ' Ana ', holderNumber: 57, socioIds: ['ana', 'hija', 'nieto'], statuses })).toEqual({
      nombre: 'Ana',
      numero: 57,
      cuotaCents: 3500,
    });
    expect(groupMessageRecipientValues({ holderName: '', holderNumber: null, socioIds: ['nieto'], statuses })).toEqual(NEUTRAL_PERSONAL_VALUES);
    expect(groupMessageRecipientValues({ holderName: 'X', holderNumber: 1, socioIds: ['ana'], statuses: null }).cuotaCents).toBeNull();
  });
});
