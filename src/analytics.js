// Lightweight analytics event logger. In production this would forward to a
// real collector (Segment/GA4/etc.); for the demo it buffers + console.debugs.

const buffer = [];
const listeners = [];

export function track(event, props = {}) {
  const entry = { event, props, t: Date.now() };
  buffer.push(entry);
  if (buffer.length > 500) buffer.shift();
  if (import.meta.env.DEV) console.debug('[track]', event, props);
  for (const fn of listeners) fn(entry);
}

export function onTrack(fn) {
  listeners.push(fn);
}

export function getEvents() {
  return [...buffer];
}
