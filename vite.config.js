import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Use relative asset URLs so the build works on both a project Pages URL
  // (https://user.github.io/repository/) and a custom domain.
  base: './',
  plugins: [react()],
});
