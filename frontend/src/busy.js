// Tracks API requests in flight so the page can show that something is happening.
// The busy state only turns on after 150 ms, so fast requests don't make the bar flicker.

let pending = 0;
let timer;

export function busyStart() {
  pending += 1;
  if (pending === 1) timer = setTimeout(() => document.body.classList.add('is-busy'), 150);
}

export function busyEnd() {
  pending = Math.max(0, pending - 1);
  if (pending === 0) {
    clearTimeout(timer);
    document.body.classList.remove('is-busy');
  }
}
