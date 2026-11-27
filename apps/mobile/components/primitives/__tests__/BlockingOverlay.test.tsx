import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BackHandler, Text } from 'react-native';
import { render, screen, within } from '@testing-library/react-native';
import { BlockingOverlay, BlockingOverlayHost, useBlockingOverlayActive } from '../BlockingOverlay';

function Active() {
  return <Text testID="active">{String(useBlockingOverlayActive())}</Text>;
}

describe('<BlockingOverlay>', () => {
  it('paints the wait label in the host when visible', () => {
    render(
      <>
        <BlockingOverlay visible label="Eliminando evento…" />
        <BlockingOverlayHost />
      </>,
    );
    expect(within(screen.getByTestId('blocking-overlay')).getByText('Eliminando evento…')).toBeTruthy();
  });

  it('paints nothing when hidden', () => {
    render(
      <>
        <BlockingOverlay visible={false} label="Eliminando evento…" />
        <BlockingOverlayHost />
      </>,
    );
    expect(screen.queryByTestId('blocking-overlay')).toBeNull();
    expect(screen.queryByText('Eliminando evento…')).toBeNull();
  });

  it('clears when its caller unmounts', () => {
    const { rerender } = render(
      <>
        <BlockingOverlay visible label="Eliminando…" />
        <BlockingOverlayHost />
      </>,
    );
    expect(screen.getByTestId('blocking-overlay')).toBeTruthy();
    rerender(<BlockingOverlayHost />);
    expect(screen.queryByTestId('blocking-overlay')).toBeNull();
  });

  it('claims every touch so nothing beneath it can be pressed', () => {
    render(
      <>
        <BlockingOverlay visible label="Eliminando…" />
        <BlockingOverlayHost />
      </>,
    );
    const backdrop = screen.getByTestId('blocking-overlay');
    expect(backdrop.props.onStartShouldSetResponder()).toBe(true);
    expect(backdrop.props.accessibilityViewIsModal).toBe(true);
  });

  it('paints only in the topmost host, so it sits above an open sheet', () => {
    function Layers({ sheetOpen }: { sheetOpen: boolean }) {
      return (
        <>
          <BlockingOverlay visible label="Eliminando…" />
          <BlockingOverlayHost />
          {sheetOpen ? <BlockingOverlayHost /> : null}
        </>
      );
    }
    const { rerender } = render(<Layers sheetOpen />);
    expect(screen.getAllByTestId('blocking-overlay')).toHaveLength(1);
    rerender(<Layers sheetOpen={false} />);
    expect(screen.getAllByTestId('blocking-overlay')).toHaveLength(1);
  });

  it('swallows Android back while up, and reports itself active', () => {
    const add = jest.spyOn(BackHandler, 'addEventListener');
    const { rerender } = render(
      <>
        <BlockingOverlay visible label="Eliminando…" />
        <BlockingOverlayHost />
        <Active />
      </>,
    );
    const handler = add.mock.calls.find(([event]) => event === 'hardwareBackPress')?.[1];
    expect(handler?.()).toBe(true);
    expect(screen.getByTestId('active').props.children).toBe('true');
    rerender(
      <>
        <BlockingOverlayHost />
        <Active />
      </>,
    );
    expect(screen.getByTestId('active').props.children).toBe('false');
    add.mockRestore();
  });

  // A native Modal freezes iOS when presented over another (Órdago's
  // blocking-overlay-no-native-modal decision). A comment did not hold there;
  // this does.
  it('never renders a native Modal', () => {
    const code = readFileSync(path.join(__dirname, '..', 'BlockingOverlay.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/<Modal\b/);
    expect(code).not.toMatch(/import[^;]*\bModal\b[^;]*from 'react-native'/);
  });
});
