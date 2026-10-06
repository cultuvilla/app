import { describe, it, expect } from 'vitest';
import {
  capacityLabel,
  registrationEmailSubject,
  renderRegistrationEmailHtml,
  renderRegistrationEmailText,
  type RegistrationEmailContent,
} from '../../src/email/registrationEmailTemplate';

function content(overrides: Partial<RegistrationEmailContent> = {}): RegistrationEmailContent {
  return {
    kind: 'registration',
    eventTitle: 'Fiesta de San Juan',
    eventUrl: 'https://villa-events.web.app/event/e1',
    imageURL: 'https://storage.example/flyer.jpg',
    dateLabel: '24 de junio de 2026, 20:00',
    locationName: 'Plaza Mayor',
    villageName: 'Villarriba',
    attendees: [{ name: 'Ana', status: 'confirmed', position: 1 }],
    confirmedCount: 3,
    maxAttendees: 50,
    ...overrides,
  };
}

describe('capacityLabel', () => {
  it('reports occupied slots against the cap', () => {
    expect(capacityLabel(3, 50)).toBe('3 de 50 plazas ocupadas');
  });

  it('counts people instead of slots when the event is uncapped', () => {
    expect(capacityLabel(7, null)).toBe('7 personas apuntadas');
  });

  it('uses the singular for a single uncapped attendee', () => {
    expect(capacityLabel(1, null)).toBe('1 persona apuntada');
  });
});

describe('registrationEmailSubject', () => {
  it('leads with the confirmation prefix for a fresh registration', () => {
    expect(registrationEmailSubject(content())).toBe('Inscripción confirmada: Fiesta de San Juan');
  });

  it('leads with the promotion prefix when a waitlisted user moves up', () => {
    expect(registrationEmailSubject(content({ kind: 'waitlist_promotion' }))).toBe(
      '¡Plaza confirmada!: Fiesta de San Juan',
    );
  });
});

describe('renderRegistrationEmailHtml', () => {
  it('carries every fact the reader needs', () => {
    const html = renderRegistrationEmailHtml(content());
    expect(html).toContain('Fiesta de San Juan');
    expect(html).toContain('24 de junio de 2026, 20:00');
    expect(html).toContain('Plaza Mayor');
    expect(html).toContain('Villarriba');
    expect(html).toContain('Ana — plaza confirmada');
    expect(html).toContain('3 de 50 plazas ocupadas');
    expect(html).toContain('https://villa-events.web.app/event/e1');
  });

  it('renders the flyer with a real alt so a blocked image still reads', () => {
    const html = renderRegistrationEmailHtml(content());
    expect(html).toContain('src="https://storage.example/flyer.jpg"');
    expect(html).toContain('alt="Fiesta de San Juan"');
  });

  it('omits the image block entirely when the event has no flyer', () => {
    const html = renderRegistrationEmailHtml(content({ imageURL: null }));
    expect(html).not.toContain('<img');
    expect(html).toContain('Fiesta de San Juan');
  });

  it('states the queue position and the promise to notify for waitlisted attendees', () => {
    const html = renderRegistrationEmailHtml(
      content({ attendees: [{ name: 'Bea', status: 'waitlisted', position: 4 }] }),
    );
    expect(html).toContain('Bea — en lista de espera (nº 4)');
    expect(html).toMatch(/se libera una plaza te avisaremos/i);
  });

  it('leads with the promotion explanation only for promotions', () => {
    expect(renderRegistrationEmailHtml(content({ kind: 'waitlist_promotion' }))).toMatch(
      /se ha liberado una plaza/i,
    );
    expect(renderRegistrationEmailHtml(content())).not.toMatch(/se ha liberado una plaza/i);
  });

  it('lists every registered persona', () => {
    const html = renderRegistrationEmailHtml(
      content({
        attendees: [
          { name: 'Ana', status: 'confirmed', position: 1 },
          { name: 'Bea', status: 'waitlisted', position: 2 },
        ],
      }),
    );
    expect(html).toContain('Ana — plaza confirmada');
    expect(html).toContain('Bea — en lista de espera (nº 2)');
  });

  it('escapes HTML-significant characters in event-supplied strings', () => {
    const html = renderRegistrationEmailHtml(
      content({
        eventTitle: '<script>alert(1)</script>',
        imageURL: 'https://evil.example/x.jpg" onerror="alert(1)',
      }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('onerror="alert(1)"');
  });
});

describe('renderRegistrationEmailText', () => {
  it('mirrors the HTML facts in plain text', () => {
    const text = renderRegistrationEmailText(content());
    expect(text).toContain('Fiesta de San Juan');
    expect(text).toContain('Plaza Mayor');
    expect(text).toContain('- Ana — plaza confirmada');
    expect(text).toContain('3 de 50 plazas ocupadas');
    expect(text).toContain('https://villa-events.web.app/event/e1');
  });

  it('does not HTML-escape the plain-text alternative', () => {
    const text = renderRegistrationEmailText(content({ eventTitle: 'Paella & Vino' }));
    expect(text).toContain('Paella & Vino');
    expect(text).not.toContain('&amp;');
  });
});

function cancelledContent(
  overrides: Partial<Extract<RegistrationEmailContent, { kind: 'cancellation' | 'removed' }>> = {},
): RegistrationEmailContent {
  return {
    kind: 'cancellation',
    eventTitle: 'Fiesta de San Juan',
    eventUrl: 'https://villa-events.web.app/event/e1',
    imageURL: 'https://storage.example/flyer.jpg',
    dateLabel: '24 de junio de 2026, 20:00',
    locationName: 'Plaza Mayor',
    villageName: 'Villarriba',
    attendees: [{ name: 'Ana' }],
    ...overrides,
  };
}

describe('cancellation emails', () => {
  it('distinguishes cancelling yourself from being removed in the subject', () => {
    expect(registrationEmailSubject(cancelledContent())).toBe(
      'Inscripción cancelada: Fiesta de San Juan',
    );
    expect(registrationEmailSubject(cancelledContent({ kind: 'removed' }))).toBe(
      'Te han dado de baja: Fiesta de San Juan',
    );
  });

  it('says who removed the seat so the reader is not left guessing', () => {
    expect(renderRegistrationEmailHtml(cancelledContent())).toContain('Has anulado tu inscripción');
    expect(renderRegistrationEmailHtml(cancelledContent({ kind: 'removed' }))).toContain(
      'La organización te ha dado de baja',
    );
  });

  it('lists the seats that were cancelled, with no sign-up status on them', () => {
    const html = renderRegistrationEmailHtml(
      cancelledContent({ attendees: [{ name: 'Ana' }, { name: 'Luis' }] }),
    );
    expect(html).toContain('Plazas anuladas');
    expect(html).toContain('Ana');
    expect(html).toContain('Luis');
    expect(html).not.toContain('plaza confirmada');
  });

  // Capacity and the waitlist promise describe a seat the reader no longer
  // holds; repeating them would read as if the sign-up still stood.
  it('drops the capacity line, the waitlist promise and the cancel hint', () => {
    const html = renderRegistrationEmailHtml(cancelledContent());
    expect(html).not.toContain('plazas ocupadas');
    expect(html).not.toContain('personas apuntadas');
    expect(html).not.toContain('lista de espera');
    expect(html).not.toContain('Puedes anular tu inscripción');
    expect(html).toContain('Puedes volver a apuntarte');
  });

  it('mirrors the cancellation facts in plain text', () => {
    const text = renderRegistrationEmailText(cancelledContent({ kind: 'removed' }));
    expect(text).toContain('La organización te ha dado de baja');
    expect(text).toContain('Plazas anuladas:');
    expect(text).toContain('- Ana');
    expect(text).not.toContain('plazas ocupadas');
    expect(text).toContain('https://villa-events.web.app/event/e1');
  });
});
