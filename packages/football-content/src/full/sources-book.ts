// Sources for the starter playbooks (books.ts): the systems research, read 2026-11-26 by the scheme-sources
// research thread (research/scheme-sources/systems-and-families.md, letters shown). The Ringer is one group however
// many writers, to stay conservative about independence (A5.1.2).
import type { Source } from '../starter/index.ts';

const SF = (l: string): string => `read 2026-11-26 by the scheme-sources research thread (research/scheme-sources/systems-and-families.md, ${l})`;
const PC = (l: string): string => `read 2026-11-26 by the scheme-sources research thread (research/scheme-sources/pass-concepts-and-reads.md, ${l})`;
const s = (id: string, group: string, citation: string, url: string): Source => ({ id, group, citation, url, how: 'secondary' });

export const BOOK_SOURCES: readonly Source[] = [
  s('qfb-airraid', 'queerfootballbreakdowns', `Queer Football Breakdowns, "What is the Air Raid? In honor of Mike Leach" and "West Coast Offense Definition and Pass Protection Terminology" (${SF('D')})`, 'https://queerfootballbreakdowns.substack.com/p/what-is-the-air-raid-in-honor-of'),
  s('ringer-airraid', 'theringer', `The Ringer, "air raid offense, Mike Leach and Lincoln Riley," 2018-08-14 (${SF('W')})`, 'https://www.theringer.com/2018/8/14/17685080/air-raid-offense-mike-leach-lincoln-riley'),
  s('rivals-airraid', 'rivals', `Rivals (Texas Tech site), "Air Raid 101: basics and Y-Stick" (${SF('Y')})`, 'https://texastech.rivals.com/news/air-raid-101-basics-and-y-stick'),
  s('ringer-shanahan', 'theringer', `The Ringer, Kyle Shanahan offense evolution, 2024-02-07 (${SF('AB')})`, 'https://www.theringer.com/2024/02/07/nfl/super-bowl-preview-kyle-shanahan-offense-evolution-san-francisco-49ers'),
  s('sumer-shanahan', 'sumer', `Sumer Sports, "Shanahan schemes" (${SF('AC')}): power, counter and wham as complements to outside zone`, 'https://sumersports.com/the-zone/shanahan-schemes/'),
  s('yahoo-outsidezone', 'yahoo', `Yahoo Sports, "How the Broncos helped outside zone take over the NFL" (${SF('AD')})`, 'https://sports.yahoo.com/broncos-helped-outside-zone-nfl-110807460.html'),
  // Pass concepts added with the books (offense-book.ts).
  s('sampath-ycross', 'sampath', `Kaushik Sampath, "Stanford film study: Y-cross," The Stanford Daily, 2022-09-27 (${PC('F')}): two-level cross, high at about 20 yd, low at about 13 yd`, 'https://stanforddaily.com/2022/09/27/stanford-film-study-y-cross/'),
  s('bowen-combos', 'bowen', `Matt Bowen, "NFL 101: Introducing the Basic Route Combinations," Bleacher Report (${PC('Q')}): spacing, levels`, 'https://syndication.bleacherreport.com/amp/2024638-nfl-101-introducing-the-basic-route-combinations.amp.html'),
  s('fourverts-425', 'fourverts', 'Fourverts Football (no byline or date shown), "4-2-5 defense explained," read 2026-11-26 for the starter books: Cover 3 from the 4-2-5 with the rover (nickel) and strong safety as flat defenders, linebackers in the hook/curl zones, corners and free safety in deep thirds; rover about 5 yd off the line', 'https://fourvertsfootball.com/4-2-5-defense-explained/'),
];
