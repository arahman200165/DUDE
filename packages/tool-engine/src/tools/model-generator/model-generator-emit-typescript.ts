import { EmitResult, FieldPrimitive, FieldValueType, FlattenedModel } from "./model-generator-types.js";

function primitiveType(primitive: FieldPrimitive): string {
  switch (primitive) {
    case 'string':
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    default:
      return 'unknown';
  }
}

function typeString(type: FieldValueType): string {
  switch (type.kind) {
    case 'primitive':
      return primitiveType(type.primitive);
    case 'ref':
      return type.typeName;
    case 'array':
      return `${typeString(type.of)}[]`;
    case 'unknown':
      return 'unknown';
  }
}

export function emitTypeScript(model: FlattenedModel): EmitResult {
  const blocks = model.definitions.map((definition) => {
    const fields = definition.fields
      .map((field) => `  ${field.key}${field.nullable ? '?' : ''}: ${typeString(field.type)};`)
      .join('\n');
    return `export interface ${definition.name} {\n${fields}\n}`;
  });

  const suffix = model.rootWasArray ? `\nexport type ${model.rootName}List = ${model.rootName}[];` : '';
  return { code: blocks.join('\n\n') + suffix, warnings: [] };
}
