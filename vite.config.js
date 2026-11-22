import {defineConfig} from 'vite';
import {bookingApi} from './server/booking.js';
export default defineConfig({
  base:'./',
  plugins:[{name:'arena-booking',configureServer(server){server.middlewares.use(bookingApi)},configurePreviewServer(server){server.middlewares.use(bookingApi)}}],
  build:{chunkSizeWarningLimit:700,rollupOptions:{output:{manualChunks:{three:['three']}}}}
});
