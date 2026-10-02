import { toPascalCase } from "./model-generator-naming.js";
import { FieldValueType, FlattenedModel, InferredType, ModelDefinition, ModelField } from "./model-generator-types.js";

function singularize(name: string): string {
  if (/ies$/i.test(name)) return name.replace(/ies$/i, 'y');
  if (/ses$/i.test(name)) return name.replace(/es$/i, '');
  if (/s$/i.test(name) && !/ss$/i.test(name)) return name.replace(/s$/i, '');
  return name;
}

/**
 * Turns the tree-shaped `InferredType` into a flat list of named `ModelDefinition`s (one per
 * distinct object encountered) plus a pointer to the root's name — the shape every per-language
 * emitter renders from, so none of them has to walk the tree or invent type names themselves.
 */
export function flattenModel(root: InferredType, rootName: string): FlattenedModel {
  const definitions: ModelDefinition[] = [];
  const usedNames = new Set<string>();

  const uniqueName = (preferred: string): string => {
    const base = preferred === '' ? 'Model' : preferred;
    let name = base;
    let suffix = 2;
    while (usedNames.has(name)) {
      name = `${base}${suffix}`;
      suffix += 1;
    }
    usedNames.add(name);
    return name;
  };

  const resolve = (type: InferredType, nameHint: string): FieldValueType => {
    if (type.kind === 'primitive') return { kind: 'primitive', primitive: type.primitive };
    if (type.kind === 'unknown') return { kind: 'unknown' };
    if (type.kind === 'array') return { kind: 'array', of: resolve(type.of, singularize(nameHint)) };

    const typeName = uniqueName(toPascalCase(nameHint));
    const index = definitions.length;
    definitions.push({ name: typeName, fields: [] });

    const fields: ModelField[] = type.fields.map((field) => ({
      key: field.key,
      type: resolve(field.type, field.key),
      nullable: field.nullable,
    }));
    definitions[index] = { name: typeName, fields };

    return { kind: 'ref', typeName };
  };

  const rootWasArray = root.kind === 'array';
  const effectiveRoot = root.kind === 'array' ? root.of : root;

  if (effectiveRoot.kind !== 'object') {
    // Bare primitive/array-of-primitive input still needs one named definition to hand every
    // emitter, so it's wrapped as a single `value` field rather than left as a dangling type alias.
    const typeName = uniqueName(toPascalCase(rootName));
    definitions.push({ name: typeName, fields: [{ key: 'value', type: resolve(effectiveRoot, 'value'), nullable: false }] });
    return { definitions, rootName: typeName, rootWasArray };
  }

  const rootRef = resolve(effectiveRoot, rootName);
  const resolvedRootName = rootRef.kind === 'ref' ? rootRef.typeName : rootName;
  return { definitions, rootName: resolvedRootName, rootWasArray };
}
