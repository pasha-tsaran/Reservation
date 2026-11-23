const paths = {
  cube: 'm12 2 9 5v10l-9 5-9-5V7l9-5Zm-9 5 9 5 9-5m-9 5v10',
  expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  ticket: 'M3 7h18v4a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4V7Zm12 0v2m0 3v2m0 2v2',
  pin: 'M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 0 1 14 0Zm-4.5 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z',
  minus: 'M5 12h14',
  plus: 'M5 12h14m-7-7v14',
  right: 'm9 6 6 6-6 6',
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  close: 'm6 6 12 12M6 18 18 6',
  calendar: 'M4 6h16v15H4V6Zm4-3v6m8-6v6M4 11h16',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-5v6l4 2',
  layers: 'm3 9 9-5 9 5-9 5-9-5Zm0 4 9 5 9-5m-18 4 9 5 9-5',
  ice: 'M3 8c0-3 3-5 6-5h6c4 0 6 2 6 5v8c0 3-3 5-6 5H9c-4 0-6-2-6-5V8Zm9-5v18',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  back: 'M20 12H4m6-6-6 6 6 6'
};

export function icon(name, size = 18) {
  return `<svg class="icon" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name]}"/></svg>`;
}
