import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const outputs=[
 'README.md','SECURITY.md','build/installer.nsh',
 'apps/web/public/manifest.webmanifest','apps/web/src/styles/theme.generated.css',
 'packages/domain/src/core/appearance/appearance-axes.generated.ts',
 'packages/tool-registry/src/index.ts','apps/web/src/app/core/registry/tool-definitions.ts',
 'apps/web/src/app/core/registry/panel-definitions.ts','apps/web/src/app/core/registry/tool-loaders.generated.ts',
 'apps/web/src/app/core/pipeline/pipeline-workers.generated.ts','apps/web/src/app/core/parity/testing/fixture-loaders.generated.ts',
 'docs/architecture/phase31a-extraction-inventory.json','docs/architecture/data-scope-inventory.json',
];
function hashes(){return outputs.map(file=>createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex'));}
const before=hashes();
if(!process.env.npm_execpath)throw Error('Run through npm run check:generated');
const generated=spawnSync(process.execPath,[process.env.npm_execpath,'run','generate:registry'],{cwd:root,stdio:'inherit'});
if(generated.status!==0)process.exit(generated.status??1);
const after=hashes(),changed=outputs.filter((_file,i)=>before[i]!==after[i]);
if(changed.length)throw Error(`Generated outputs were stale: ${changed.join(', ')}. Review and commit their regenerated content.`);
console.log(`${outputs.length} generator outputs are fresh and repeatable.`);
