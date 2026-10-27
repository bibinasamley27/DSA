import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BenchmarkPanel, validateReport } from './BenchmarkPanel';
import measured from '../../../test-fixtures/benchmark.json';

it('imports a real paired engine report and exports its schedules unchanged', async () => {
  expect(validateReport(measured)).toBe(true);
  const create = vi.fn((_blob: Blob) => 'blob:measured-report');
  const revoke = vi.fn();
  vi.stubGlobal('URL', Object.assign(class extends URL {}, {
    createObjectURL: create,
    revokeObjectURL: revoke,
  }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    render(<BenchmarkPanel />);
    const input = screen.getByLabelText('Benchmark report file');
    const file = new File([JSON.stringify(measured)], 'benchmark.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(measured) });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText(`${measured.rows.length} measured runs · ${measured.duration_ticks} ticks per run`);
    expect(screen.getByText('fixed')).toBeInTheDocument();
    expect(screen.getByText('adaptive')).toBeInTheDocument();
    expect(input).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
    expect(click).toHaveBeenCalledTimes(1);
    const exported = create.mock.calls[0]![0] as unknown as Blob;
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(exported);
    });
    expect(JSON.parse(text)).toEqual(measured);
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:measured-report'), { timeout: 2000 });
  } finally {
    click.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('rejects malformed metrics, duplicate pairs and null rows', () => {
  for (const invalid of [
    { ...measured, rows: [null] },
    { ...measured, rows: [...measured.rows, ...measured.rows] },
    { ...measured, rows: measured.rows.map((row) => ({ ...row, mean_wait_ticks: Infinity })) },
    { ...measured, rows: measured.rows.slice(0, 1) },
  ]) {
    expect(validateReport(invalid)).toBe(false);
  }
});

it('shows an import error without enabling export', async () => {
  render(<BenchmarkPanel />);
  fireEvent.change(screen.getByLabelText('Benchmark report file'), {
    target: { files: [{ text: async () => '{broken' }] },
  });
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Export JSON' })).toBeDisabled();
});
