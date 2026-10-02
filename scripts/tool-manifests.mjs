import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
export const ROOT=path.resolve(import.meta.dirname,'..');
export const MANIFEST_ROOT=path.join(ROOT,'packages/tool-registry/src/tools');
function literal(n){
 if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return n.text;if(ts.isNumericLiteral(n))return Number(n.text);
 if(n.kind===ts.SyntaxKind.TrueKeyword)return true;if(n.kind===ts.SyntaxKind.FalseKeyword)return false;
 if(ts.isArrayLiteralExpression(n))return n.elements.map(literal);
 if(ts.isObjectLiteralExpression(n))return Object.fromEntries(n.properties.map(p=>{if(!ts.isPropertyAssignment(p))throw Error('Metadata must use literal properties');return[p.name.text,literal(p.initializer)];}));
 throw Error('Nonliteral portable metadata: '+n.getText());
}
export function readManifests(){const seen=new Set();return readdirSync(MANIFEST_ROOT).sort().map(id=>{
 const file=path.join(MANIFEST_ROOT,id,`${id}.manifest.ts`);const sf=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 const decl=sf.statements.find(ts.isVariableStatement)?.declarationList.declarations.find(d=>d.name.getText(sf)==='manifest');if(!decl?.initializer)throw Error('Missing manifest: '+file);
 const metadata=literal(decl.initializer);if(metadata.id!==id||seen.has(metadata.id))throw Error('Duplicate or mismatched ID: '+file);seen.add(id);
 if(metadata.load||metadata.settingsSection?.load)throw Error('Metadata contains an app loader: '+id);return{file,metadata};
});}
