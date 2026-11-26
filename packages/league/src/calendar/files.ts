// The calendar files shipped with the league package (C4.1.1 inputs, T3.2.1).
import proPattern from './data/pro-pattern.json' with { type: 'json' };
import pro2026 from './data/pro-2026.json' with { type: 'json' };
import pro2027 from './data/pro-2027.json' with { type: 'json' };
import collegePattern from './data/college-pattern.json' with { type: 'json' };
import college2026 from './data/college-2026.json' with { type: 'json' };
import college2027 from './data/college-2027.json' with { type: 'json' };
import type { CalendarFile } from './types.ts';

export const CALENDAR_FILES: readonly CalendarFile[] = [
  proPattern, pro2026, pro2027, collegePattern, college2026, college2027,
] as unknown as CalendarFile[];
