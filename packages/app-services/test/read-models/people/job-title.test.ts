// Staff job ids read as their catalogue titles (X8.1.2), so the staff list never shows a raw key.
import { describe, expect, it } from 'vitest';
import { positions } from '@gm/career';
import { jobTitle } from '../../../src/read-models/people/index.ts';

describe('jobTitle', () => {
  it('gives every catalogue job its title', () => {
    for (const j of positions.CATALOGUE.jobs) expect(jobTitle(j.id)).toBe(j.title);
  });
  it('is null for a key that is not a catalogue job', () => {
    expect(jobTitle('pp.none')).toBeNull();
  });
});
