// Neutral team strips for a team the content gives no colours (presentation only, no team mark, A6). Kept in
// the token source so component code holds no literal colour (O6.2.1).
export const NEUTRAL_STRIPS = [{ primary: '#4a4a4a', alternate: '#e6e6e6' }, { primary: '#e6e6e6', alternate: '#4a4a4a' }] as const;
