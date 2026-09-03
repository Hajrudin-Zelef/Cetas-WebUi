// Validateur des pools SamAgent — `node js/validate-pools.mjs`
// Vérifie que chaque entrée de ROUTER_CONFIG existe dans le catalogue statique
// (sauf OpenRouter : résolu à chaud via le cache /v1/models). Exit 1 si écart.
// © Marexsoft Corporation. Fondateur Kouassi Marius.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const R = require(new URL('../core/router.js', import.meta.url).pathname);

const sandbox = {};
vm.createContext(sandbox);
const MODELS_DATA = vm.runInContext(
    fs.readFileSync(new URL('../../models.js', import.meta.url), 'utf-8') + ';\nMODELS_DATA',
    sandbox
);
if (!MODELS_DATA) { console.error('models.js: MODELS_DATA introuvable'); process.exit(1); }

const catalog = new Set((MODELS_DATA.text || []).map((m) => m.id));
const imageCat = new Set((MODELS_DATA.image || []).map((m) => m.id));

let missing = [];
let orEntries = 0;
let checked = 0;
for (const [tier, intents] of Object.entries(R.ROUTER_CONFIG)) {
    for (const [intent, models] of Object.entries(intents)) {
        for (const m of models) {
            if (m.provider === 'openrouter') { orEntries++; continue; }
            checked++;
            if (!catalog.has(m.model) && !imageCat.has(m.model)) {
                missing.push(`${tier}/${intent} -> ${m.model} (${m.provider})`);
            }
        }
    }
}

if (missing.length) {
    console.error(`ÉCARTS STATIQUES (${missing.length}) :`);
    missing.forEach((x) => console.error('  -', x));
    process.exitCode = 1;
} else {
    console.log(`Pools OK : ${checked} entrées statiques vérifiées, ${orEntries} OpenRouter (dynamiques) ignorées.`);
}
