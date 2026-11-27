// Copies the tested core library and the demo project into the Forge app, which bundles them.
// Run after changing ../traceguard: npm run sync-core
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(app, '..', 'traceguard');
mkdirSync(join(app, 'src', 'core'), { recursive: true });
mkdirSync(join(app, 'src', 'demo'), { recursive: true });
for (const f of readdirSync(join(src, 'core', 'src')).filter(f => f.endsWith('.js'))) {
  cpSync(join(src, 'core', 'src', f), join(app, 'src', 'core', f));
}
cpSync(join(src, 'demo', 'brake-ecu.js'), join(app, 'src', 'demo', 'brake-ecu.js'));
console.log('core and demo synced into app/src');
