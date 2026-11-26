// Writes a composition as MusicXML 4.0 (partwise) for MuseScore Studio to render (PV-11).
// Pure string building: same composition in, same bytes out.
import { BEATS_PER_BAR, UNITS_PER_BEAT, checkComposition, parseBar, type Composition, type PartScore } from './compositions.ts';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function pitchXml(p: string): string {
  const m = /^([A-G])([b#]?)(-?\d)$/.exec(p)!;
  const alter = m[2] === 'b' ? '<alter>-1</alter>' : m[2] === '#' ? '<alter>1</alter>' : '';
  return `<pitch><step>${m[1]}</step>${alter}<octave>${m[3]}</octave></pitch>`;
}

function clefXml(part: PartScore): string {
  if (part.clef === 'percussion') return '<clef><sign>percussion</sign><line>2</line></clef>';
  return part.clef === 'F' ? '<clef><sign>F</sign><line>4</line></clef>' : '<clef><sign>G</sign><line>2</line></clef>';
}

function partList(c: Composition): string {
  return c.parts.map((p, i) => {
    const id = `P${i + 1}`;
    const midi = p.midiUnpitched !== undefined
      ? `<midi-channel>10</midi-channel><midi-unpitched>${p.midiUnpitched}</midi-unpitched>`
      : `<midi-channel>${i + 1 >= 10 ? i + 2 : i + 1}</midi-channel><midi-program>${p.midiProgram}</midi-program>`;
    return `<score-part id="${id}"><part-name>${esc(p.name)}</part-name>` +
      `<score-instrument id="${id}-I1"><instrument-name>${esc(p.name)}</instrument-name><instrument-sound>${p.sound}</instrument-sound></score-instrument>` +
      `<midi-instrument id="${id}-I1">${midi}<volume>80</volume></midi-instrument></score-part>`;
  }).join('\n    ');
}

function partBody(c: Composition, p: PartScore, index: number): string {
  const id = `P${index + 1}`;
  const dyn = ((p.velocity / 90) * 100).toFixed(2);
  return p.bars.map((bar, b) => {
    let head = '';
    if (b === 0) {
      head = `<attributes><divisions>${UNITS_PER_BEAT}</divisions><key><fifths>${c.fifths}</fifths></key>` +
        `<time><beats>${BEATS_PER_BAR}</beats><beat-type>4</beat-type></time>${clefXml(p)}</attributes>`;
      if (index === 0) {
        head += `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${c.bpm}</per-minute></metronome></direction-type><sound tempo="${c.bpm}"/></direction>`;
      }
    }
    const notes = parseBar(bar).map((n) => {
      const len = `<duration>${n.units}</duration><voice>1</voice><type>${n.type}</type>${n.dotted ? '<dot/>' : ''}`;
      if (n.pitches.length === 0) return `<note><rest/>${len}</note>`;
      if (n.pitches[0] === 'x') {
        return `<note dynamics="${dyn}"><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched>${len}<instrument id="${id}-I1"/></note>`;
      }
      return n.pitches.map((pt, k) => `<note dynamics="${dyn}">${k > 0 ? '<chord/>' : ''}${pitchXml(pt)}${len}</note>`).join('');
    }).join('');
    return `<measure number="${b + 1}">${head}${notes}</measure>`;
  }).join('\n    ');
}

export function toMusicXml(c: Composition): string {
  const problems = checkComposition(c);
  if (problems.length) throw new Error(`composition ${c.id} is not valid:\n${problems.join('\n')}`);
  const parts = c.parts.map((p, i) => `  <part id="P${i + 1}">\n    ${partBody(c, p, i)}\n  </part>`).join('\n');
  return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n' +
    `<score-partwise version="4.0">\n  <work><work-title>${esc(c.title)}</work-title></work>\n` +
    `  <identification><creator type="composer">Gridiron Manager</creator><rights>Original composition for Gridiron Manager</rights></identification>\n` +
    `  <part-list>\n    ${partList(c)}\n  </part-list>\n${parts}\n</score-partwise>\n`;
}
