import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from "@rollup/plugin-json";

export default {
  input: 'xmd.js',
  output: {
    file: 'dist/xmd.js',
    format: 'commonjs',
  },
  plugins: [
    resolve(),
    json(),
    commonjs({
      include: /node_modules/,
      requireReturnsDefault: 'auto'
  }),
  ],
}