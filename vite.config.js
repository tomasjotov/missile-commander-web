import { defineConfig } from 'vite';

// Relative asset paths – the build works from any folder on the web server,
// e.g. a sub-folder such as /demo/missile/
export default defineConfig({
    base: './',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        chunkSizeWarningLimit: 2000
    }
});
