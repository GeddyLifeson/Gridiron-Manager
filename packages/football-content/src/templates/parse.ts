// Template text grammar (P4.6.1). Kept deliberately small: templates hold no logic beyond variant
// choice and plural forms.
//   {name}            insert parameter `name`
//   {name|one|other}  plural form chosen by number parameter `name`; `#` inside a form inserts the number
//   {{  }}            literal braces
// Anything else inside braces is a parse error, so a typo never reaches the screen silently.

export type Token =
  | { readonly t: 'lit'; readonly text: string }
  | { readonly t: 'param'; readonly name: string }
  | { readonly t: 'plural'; readonly name: string; readonly one: string; readonly other: string };

export interface ParseResult { readonly tokens: readonly Token[]; readonly errors: readonly string[] }

const NAME = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export function parseTemplate(src: string): ParseResult {
  const tokens: Token[] = [];
  const errors: string[] = [];
  let lit = '';
  let i = 0;
  const flush = () => { if (lit) { tokens.push({ t: 'lit', text: lit }); lit = ''; } };
  while (i < src.length) {
    const c = src[i]!;
    if (c === '{' && src[i + 1] === '{') { lit += '{'; i += 2; continue; }
    if (c === '}' && src[i + 1] === '}') { lit += '}'; i += 2; continue; }
    if (c === '}') { errors.push(`unmatched } at ${i}`); i++; continue; }
    if (c !== '{') { lit += c; i++; continue; }
    const end = src.indexOf('}', i + 1);
    if (end < 0) { errors.push(`unclosed { at ${i}`); break; }
    const body = src.slice(i + 1, end);
    if (body.includes('{')) { errors.push(`nested { at ${i}`); i = end + 1; continue; }
    const parts = body.split('|');
    const name = parts[0]!.trim();
    if (!NAME.test(name)) errors.push(`bad parameter name "${name}" at ${i}`);
    else if (parts.length === 1) { flush(); tokens.push({ t: 'param', name }); }
    else if (parts.length === 3) { flush(); tokens.push({ t: 'plural', name, one: parts[1]!, other: parts[2]! }); }
    else errors.push(`plural form at ${i} needs exactly two forms: {${name}|one|other}`);
    i = end + 1;
  }
  flush();
  return { tokens, errors };
}

/** Parameter names a text uses, with whether each is used as a plural selector. */
export function usedParams(tokens: readonly Token[]): Map<string, { plural: boolean }> {
  const out = new Map<string, { plural: boolean }>();
  for (const tk of tokens) {
    if (tk.t === 'lit') continue;
    const prev = out.get(tk.name);
    out.set(tk.name, { plural: (prev?.plural ?? false) || tk.t === 'plural' });
  }
  return out;
}
