import { describe, expect, it } from 'vitest';
import { freeSaveName } from '../../src/App.tsx';

describe('a new career picks a free save name', () => {
  it('keeps a free name and moves a taken one to the lowest free number', () => {
    expect(freeSaveName('career-1', [])).toBe('career-1');
    expect(freeSaveName('career-1', ['career-1'])).toBe('career-2');
    expect(freeSaveName('career-1', ['career-1', 'career-2', 'career-4'])).toBe('career-3');
    expect(freeSaveName('mine', ['mine'])).toBe('mine-1');
    expect(freeSaveName('', ['career-1'])).toBe('career-2');
  });
});
