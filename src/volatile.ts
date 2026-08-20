/**
 * Strip the authoring-timestamp lines before comparing two invocations of
 * `authorAgentsMd`. Both the banner's embedded ISO stamp and the visible
 * `*Authored: <date>*` line change on every invocation by design — comparing
 * them raw would make any cross-time comparison (`--check` against a
 * previously-authored file, a golden fixture against a fresh run, a default
 * re-run deciding whether to write) report "stale"/"different" immediately,
 * even with zero real drift. Everything else (the actual detected facts)
 * still gets compared exactly.
 */
export function stripVolatile(text: string): string {
  return text
    .replace(/ · authored: [^\s]+ -->/, ' -->')
    .split('\n')
    .filter((line) => !/^\*Authored: \d{4}-\d{2}-\d{2}\*$/.test(line))
    .join('\n');
}
