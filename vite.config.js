import {defineConfig} from 'vite';
import {readdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {brotliCompressSync, constants} from 'node:zlib';
import {bookingApi} from './server/booking.js';

export default defineConfig({
  base: './',
  plugins: [
    {name:'arena-booking',configureServer(server){server.middlewares.use(bookingApi)},configurePreviewServer(server){server.middlewares.use(bookingApi)}},
    {
      name: 'arena-static-compression', apply: 'build',
      async writeBundle({dir}) {
        const files=await readdir(dir,{recursive:true});
        for(const name of files.filter(name=>/\.(glb|json|js|css|html)$/.test(name))){
          const file=path.join(dir,name);
          const compressed=brotliCompressSync(await readFile(file),{params:{[constants.BROTLI_PARAM_QUALITY]:7}});
          await writeFile(file+'.br',compressed);
        }
      }
    }
  ],
  build: { rollupOptions: { output: { manualChunks(id) { if(id.includes('/node_modules/three/'))return 'three'; } } }, chunkSizeWarningLimit: 700 }
});
