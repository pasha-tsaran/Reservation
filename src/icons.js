const paths={
 play:'M7 4l13 8-13 8V4Z',pause:'M8 5v14M16 5v14',
 ticket:'M3 7h18v4a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4V7Zm12 0v2m0 3v2m0 2v2',
 help:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.4 9a2.7 2.7 0 0 1 5.1 1.3c0 2-2.5 2.1-2.5 4m0 2h.01',
 pin:'M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 0 1 14 0Zm-4.5 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z',
 cube:'m12 2 9 5v10l-9 5-9-5V7l9-5Zm-9 5 9 5 9-5m-9 5v10',
 map:'m3 7 6-3 6 3 6-3v14l-6 3-6-3-6 3V7Zm6-3v14m6-11v14',
 expand:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',minus:'M5 12h14',plus:'M5 12h14m-7-7v14',
 focus:'M3 9V4h5m8 0h5v5M3 15v5h5m8 0h5v-5m-6-3a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
 rotate:'M4 13c0-3 4-6 9-6 4 0 7 2 7 5s-3 5-7 5m-1-3 3.5 3-3.5 3m-5-6-3-2-2 3',
 eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
 left:'m14 6-6 6 6 6',right:'m9 6 6 6-6 6',down:'m6 9 6 6 6-6',arrow:'M4 12h15m-6-6 6 6-6 6',close:'m6 6 12 12M6 18 18 6',
 calendar:'M4 6h16v15H4V6Zm4-3v6m8-6v6M4 11h16',clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-5v6l4 2',
 layers:'m3 9 9-5 9 5-9 5-9-5Zm0 4 9 5 9-5m-18 4 9 5 9-5',
 seat:'M6 3h11l1 10H7L6 3Zm-1 12h14v3H5v-3Zm2 3v3m10-3v3',check:'m4 12 5 5L20 6',
 tune:'M3 6h7m4 0h7M3 17h11m4 0h3M10 3v6m4 5v6',mouse:'M6 10a6 6 0 0 1 12 0v5a6 6 0 0 1-12 0v-5Zm6-6v6',
 flag:'M5 21V4m0 0c5-4 9 4 15 0v10c-6 4-10-4-15 0',ice:'M3 8c0-3 3-5 6-5h6c4 0 6 2 6 5v8c0 3-3 5-6 5H9c-4 0-6-2-6-5V8Zm0 4h18',
 trash:'M4 7h16m-12 0V4h8v3M6 8l1 12h10l1-12',volume:'M3 10h4l5-4v12l-5-4H3z',info:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-1v6m0-10h.01',hand:'M5 13l4 4V7a1.3 1.3 0 0 1 2.6 0v5-8a1.3 1.3 0 0 1 2.6 0v8-6a1.3 1.3 0 0 1 2.6 0v7-3a1.3 1.3 0 0 1 2.6 0v6c0 4-3 6-6 6h-2c-2 0-3-1-4-2l-4-5',
 list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',back:'M20 12H4m6-6-6 6 6 6'
};
export function icon(name,size=18){return '<svg class="icon" aria-hidden="true" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="'+paths[name]+'"/></svg>';}

