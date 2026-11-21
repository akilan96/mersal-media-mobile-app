import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const base = path.resolve('design-reference/stitch_mersal_media_app_redesign');
const originalAssets = path.resolve('design-reference/remote-assets');
await mkdir(originalAssets, { recursive: true });
const manifest = [];
for (const [screen, output] of [['welcome_splash', 'welcome-hero.png'], ['login', 'login-hero.png'], ['photos_coming_soon', 'photos-hero.png']]) {
  const html = await readFile(path.join(base, screen, 'code.html'), 'utf8');
  const url = html.match(/<img\b[^>]*\bsrc="([^"]+)"/i)?.[1];
  if (!url) throw new Error(`No image found in ${screen}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${screen}: HTTP ${response.status}`);
  const content = Buffer.from(await response.arrayBuffer());
  if (!response.headers.get('content-type')?.startsWith('image/')) throw new Error('Expected image');
  await writeFile(path.join(originalAssets, output), content);
  manifest.push({ screen, file: output, source: url, bytes: content.length, contentType: response.headers.get('content-type') });
  console.log(`${output}: ${content.length} bytes`);
}
await writeFile('assets/design/remote-source-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
