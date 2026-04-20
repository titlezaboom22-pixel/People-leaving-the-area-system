import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        drink: resolve(__dirname, 'drink.html'),
        employee: resolve(__dirname, 'employee.html'),
        equipment: resolve(__dirname, 'equipment.html'),
        food: resolve(__dirname, 'food.html'),
        goods: resolve(__dirname, 'goods.html'),
        outing: resolve(__dirname, 'outing.html'),
        vehicle: resolve(__dirname, 'vehicle.html'),
      }
    }
  }
});
