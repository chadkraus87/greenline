// Minimal change emitter: mutations call emitDataChange() after a successful
// write; the data hook subscribes and refetches. Keeps feature call-sites simple.
type Listener = () => void;
const listeners = new Set<Listener>();

export function onDataChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emitDataChange(): void {
  for (const fn of listeners) fn();
}
