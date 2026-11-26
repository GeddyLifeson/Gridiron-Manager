// The ten hubs (O1.1.1), in bar order, each with its fixed number key. The O1.1.1 body says "nine
// entries" but its own table lists ten (0 is School); the table is followed.
export const HUBS = [
  { id: 'office', key: '1' },
  { id: 'team', key: '2' },
  { id: 'football', key: '3' },
  { id: 'week', key: '4' },
  { id: 'game', key: '5' },
  { id: 'film', key: '6' },
  { id: 'people', key: '7' },
  { id: 'league', key: '8' },
  { id: 'coach', key: '9' },
  { id: 'school', key: '0' },
] as const;

export type HubId = (typeof HUBS)[number]['id'];
export const HUB_IDS: readonly HubId[] = HUBS.map((h) => h.id);
export const isHubId = (s: string): s is HubId => (HUB_IDS as readonly string[]).includes(s);
export const hubForKey = (key: string): HubId | undefined => HUBS.find((h) => h.key === key)?.id;
export const keyForHub = (hub: HubId): string => HUBS.find((h) => h.id === hub)!.key;
