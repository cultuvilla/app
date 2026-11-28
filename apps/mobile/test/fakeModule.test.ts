import { fakeModule, fakeService } from './fakeModule';

describe('fakeModule', () => {
  const actual = { greet: (name: string) => `hola ${name}`, PAGE_SIZE: 20 };

  it('stubs every function, keeps every constant, and runs a default when given', () => {
    const fake = fakeModule(
      () => actual,
      () => ({ greet: () => 'stub' }),
    );

    expect(fake.greet('x')).toBe('stub');
    expect(jest.isMockFunction(fake.greet)).toBe(true);
    expect(fake.PAGE_SIZE).toBe(20);
  });

  it('uses a default that is already a mock as the export, so programming one programs both', () => {
    const greet = jest.fn<string, [string]>();
    const fake = fakeModule(
      () => actual,
      () => ({ greet }),
    );

    expect(fake.greet).toBe(greet);
    jest.mocked(fake.greet).mockReturnValue('programmed');
    expect(greet('x')).toBe('programmed');
  });

  it('refuses a default for an export the module does not have', () => {
    const fake = fakeModule(
      () => actual,
      () => ({ farewell: () => 'adiós' }) as never,
    );

    expect(() => fake.greet).toThrow('farewell');
  });

  it('does not load the real module until the fake is first read', () => {
    const loadActual = jest.fn(() => actual);
    const fake = fakeModule(loadActual);

    expect(loadActual).not.toHaveBeenCalled();
    void fake.PAGE_SIZE;
    void fake.greet;
    expect(loadActual).toHaveBeenCalledTimes(1);
  });
});

describe('fakeService', () => {
  const SPECIFIER = '@cultuvilla/shared/services/organizationService';

  it('has exactly the real service’s exports, every function a jest.fn', () => {
    const fake = fakeService<Record<string, unknown>>(SPECIFIER);
    const actual = jest.requireActual<Record<string, unknown>>(SPECIFIER);

    expect(
      Object.keys(fake)
        .filter((key) => key !== '__esModule')
        .sort(),
    ).toEqual(
      Object.keys(actual)
        .filter((key) => key !== '__esModule')
        .sort(),
    );
    const unstubbed = Object.keys(actual).filter(
      (key) => typeof actual[key] === 'function' && !jest.isMockFunction(fake[key]),
    );
    expect(unstubbed).toEqual([]);
  });
});
