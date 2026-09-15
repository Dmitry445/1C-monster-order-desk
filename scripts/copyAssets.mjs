import { copyFile, cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf'];
await mkdir(resolve(root, 'dist/server/assets'), { recursive: true });
await Promise.all(
  files.map(file =>
    copyFile(resolve(root, 'src/server/assets', file), resolve(root, 'dist/server/assets', file))
  )
);

if (process.env.ELECTRON === 'true') {
  await cp(resolve(root, 'node_modules/pdfkit/js/data'), resolve(root, 'dist-electron/data'), {
    recursive: true
  });
}
