// Manual rule titles carry their number as an "R-00N " prefix.
export function splitRuleTitle(title: string): { number: string | null; text: string } {
  const m = /^(R-\d+)\s+(.*)$/.exec(title);
  return m ? { number: m[1]!, text: m[2]! } : { number: null, text: title };
}
