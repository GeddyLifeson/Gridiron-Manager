// The shared "message" event (plans/head-coach-nuance.md item 3; E10.4.1 words against deeds, L2.4.2 how
// messages travel, H4.2.3 tone fit). Every system that says something to the people it touches emits one:
// the team meeting (H4), press (H7), discipline (L3), fourth down (I5), the depth chart (M2) and one-on-ones.
// The reading rule lives in career/src/coach/messages.ts (`Message`); this is its schema mirror, so the
// emitters and the save share one shape. What the club said is its own record (own_team); a public message is
// heard by every audience, a private one by `heardBy` only.
import { z } from 'zod';
import { own } from '../field.ts';

export const MESSAGE_AUDIENCES = ['offense', 'defense', 'special_teams', 'leaders', 'staff', 'owner', 'media', 'opponent'] as const;
export const MESSAGE_SOURCES = ['team_meeting', 'press', 'discipline', 'depth_chart', 'fourth_down', 'one_on_one'] as const;
export const MESSAGE_TONES = ['demanding', 'supportive', 'neutral'] as const;

export const MessageAudience = own(z.enum(MESSAGE_AUDIENCES));
export type MessageAudience = z.infer<typeof MessageAudience>;

/** One thing a message says: a stance (+1 for, -1 against) on a topic, towards an audience, maybe about a person. */
export const MessageClaim = own(z.object({
  topic: own(z.string().min(1)),
  stance: own(z.union([z.literal(1), z.literal(-1)]), 'ratio'),
  towards: MessageAudience,
  aboutId: own(z.number().int().positive(), 'id').optional(),
  /** Share of full weight (a kick says less than a go). */
  weight: own(z.number().min(0).max(1), 'ratio').optional(),
}).strict());
export type MessageClaim = z.infer<typeof MessageClaim>;

export const CoachMessage = own(z.object({
  id: own(z.string().min(1)),
  /** Week index in the career, and day of the week, 0 Monday to 6 Sunday. */
  week: own(z.number().int().min(0), 'index'),
  day: own(z.number().int().min(0).max(6), 'index'),
  source: own(z.enum(MESSAGE_SOURCES)),
  /** Said where anyone can hear it (press, a public decision) or inside the building. */
  public: own(z.boolean()),
  /** Who heard it first-hand; a public message is heard by everyone. */
  heardBy: own(z.array(MessageAudience)),
  tone: own(z.enum(MESSAGE_TONES)),
  /** The team lost its last game and this is the week after it. */
  afterLoss: own(z.boolean()),
  claims: own(z.array(MessageClaim)),
}).strict());
export type CoachMessage = z.infer<typeof CoachMessage>;
