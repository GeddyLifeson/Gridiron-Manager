// The locker room view (O4.4.1) and the owner and general manager view (O4.5.1). The coach sees only what
// has reached him: an issue is in the model only once reported to him, on or before today, by a person he
// can see (acceptance: every issue has a source entity; unreported issues are absent). Culture, buy-in,
// confidence and relationships are reads in words; no job-security number exists in the model (E4).
import type { ObservedWorld } from '../../observer/index.ts';
import type { GmRequestRow, LockerRoomView, OwnerComment, OwnerView, RoomGroup, RoomIssue, WordRead } from './types.ts';
import { compareDate, nameOf, peopleById, seenRead, visibleEventIds, worldDate, type DateLike } from './world.ts';

/** An issue as the L2 model holds it, with who it has reached. */
export interface IssueInput extends RoomIssue {
  /** The people it has reached so far, and when (L2: distance from the room delays it). */
  readonly reachedPersonIds: readonly number[];
}

export interface LockerRoomInputs {
  readonly groups?: readonly RoomGroup[];
  readonly culture?: WordRead | null;
  readonly buyIn?: WordRead | null;
  readonly issues?: readonly IssueInput[];
  readonly lostRoom?: { readonly causeKeys: readonly string[] } | null;
}

export function buildLockerRoom(world: ObservedWorld, clubId: number, coachId: number, input: LockerRoomInputs = {}): LockerRoomView {
  const people = peopleById(world);
  const today = worldDate(world);
  const seen = visibleEventIds(world);
  const issues: RoomIssue[] = (input.issues ?? [])
    .filter((i) => i.reachedPersonIds.includes(coachId) && people.has(i.sourcePersonId) && (!today || compareDate(i.reportedOn, today) <= 0))
    .map(({ reachedPersonIds: _r, ...i }) => ({ ...i, personIds: [...i.personIds], responseLinks: [...i.responseLinks] }))
    .sort((a, b) => compareDate(b.reportedOn, a.reportedOn) || a.issueId - b.issueId);
  return {
    clubId, groups: [...(input.groups ?? [])], culture: seenRead(input.culture, seen), buyIn: seenRead(input.buyIn, seen), issues,
    lostRoom: input.lostRoom ? { causeKeys: [...input.lostRoom.causeKeys] } : null,
  };
}

export interface OwnerInputs {
  readonly goalKeys?: readonly string[];
  readonly confidence?: WordRead | null;
  readonly comments?: readonly OwnerComment[];
  readonly nextMeeting?: DateLike | null;
  readonly gmPersonId?: number | null;
  readonly gmRelationship?: WordRead | null;
  readonly say?: OwnerView['gm']['say'];
  readonly requests?: readonly GmRequestRow[];
  readonly upcoming?: OwnerView['gm']['upcoming'];
}

export function buildOwnerView(world: ObservedWorld, clubId: number, input: OwnerInputs = {}): OwnerView {
  const people = peopleById(world);
  const seen = visibleEventIds(world);
  const team = (world.table('teams') as readonly Record<string, unknown>[]).find((t) => t.id === clubId);
  const ownerId = typeof team?.ownerPersonId === 'number' ? team.ownerPersonId : null;
  const gmId = input.gmPersonId ?? null;
  return {
    clubId,
    owner: {
      personId: ownerId, name: nameOf(people, ownerId), goalKeys: [...(input.goalKeys ?? [])], confidence: seenRead(input.confidence, seen),
      comments: (input.comments ?? []).filter((c) => seen.has(c.eventId)).sort((a, b) => compareDate(b.date, a.date) || a.eventId - b.eventId),
      nextMeeting: input.nextMeeting ?? null,
    },
    gm: {
      personId: gmId, name: nameOf(people, gmId), relationship: seenRead(input.gmRelationship, seen), say: [...(input.say ?? [])],
      requests: (input.requests ?? []).map((r) => ({ ...r, reasonKey: r.state === 'refused' ? r.reasonKey : null })),
      upcoming: [...(input.upcoming ?? [])],
    },
  };
}
