import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.ts',
  output: [
    { file: 'dist/pulse.js', format: 'iife', name: 'Pulse', sourcemap: true },
    { file: 'dist/pulse.min.js', format: 'iife', name: 'Pulse', plugins: [terser()] },
  ],
  plugins: [typescript({ tsconfig: './tsconfig.json', include: ['src/**/*.ts'] })],
};
