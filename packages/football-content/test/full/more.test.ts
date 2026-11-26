// Deferred items of WP-25 (option, trap, wham, pin and pull, bunch, empty, Cover 3 Sky, Cloud and match, goal line,
// prevent): each is in the set, and the shapes the deferral asked for hold.
import { describe, expect, it } from 'vitest';
import { FULL, formationOf } from '../../src/full/index.ts';

const play = (id: string) => FULL.plays.find((p) => p.id === id);
const call = (id: string) => FULL.defense.find((d) => d.id === id);

describe('deferred items are authored', () => {
  it('has the option, gap and situational runs', () => {
    for (const id of ['run_inside_veer_right', 'run_midline_right', 'run_trap_right', 'run_wham_right', 'run_pin_pull_right', 'run_goal_line_power']) expect(play(id), id).toBeDefined();
    expect(play('run_inside_veer_right')!.kind).toBe('qb_run');
    expect(formationOf(play('run_inside_veer_right')!)!.id).toBe('uc_flexbone_30');
  });
  it('has a bunch and an empty pass with no back in the empty backfield', () => {
    expect(formationOf(play('quick_bunch_trail')!)!.id).toBe('gun_bunch_right_11');
    const empty = formationOf(play('quick_empty_stick')!)!;
    expect(empty.players.filter((p) => p.px < -2).map((p) => p.role)).toEqual(['Q']);
  });
  it('has Cover 3 Sky, Cloud and match, a goal-line front and a prevent', () => {
    for (const id of ['def_cover3_sky_flat', 'def_cover3_cloud', 'def_cover3_match', 'def_goal_line_65', 'def_prevent']) expect(call(id), id).toBeDefined();
    expect(call('def_goal_line_65')!.slots.filter((s) => s.onLine).length).toBe(6);
    expect(call('def_prevent')!.rushers).toBe(4);
  });
  it('the Sky call puts a safety in the flat and the Cloud call puts a corner there', () => {
    expect(call('def_cover3_sky_flat')!.slots.find((s) => s.role === 'SS')!.params!['zone']).toBe('curlFlatRight');
    expect(call('def_cover3_cloud')!.slots.find((s) => s.role === 'RCB')!.params!['zone']).toBe('cloudFlatRight');
  });
  it('has the second-pass items: speed option, short-yardage bear, Cover 4 MEG and Solo', () => {
    expect(play('qb_speed_option_right')!.kind).toBe('qb_run');
    expect(call('def_short_yardage_bear')!.coverageFamily).toBe('cover0');
    expect(call('def_cover4_meg')!.slots.filter((s) => s.behavior === 'manCover').map((s) => s.role).sort()).toEqual(['LCB', 'RCB']);
    const solo = call('def_cover4_solo')!;
    expect(solo.drawnAgainst).toBe('gun_trips_right_11');
    expect(solo.slots.find((s) => s.role === 'LCB')!.behavior).toBe('manCover');
  });
});
