import { toSnakeCase } from "./model-generator-naming.js";
import { EmitResult, FieldPrimitive, FieldValueType, FlattenedModel, ModelField } from "./model-generator-types.js";

function primitiveType(primitive: FieldPrimitive): string {
  switch (primitive) {
    case 'string':
      return 'str';
    case 'integer':
      return 'int';
    case 'number':
      return 'float';
    case 'boolean':
      return 'bool';
    default:
      return 'Any';
  }
}

function typeString(type: FieldValueType): string {
  switch (type.kind) {
    case 'primitive':
      return primitiveType(type.primitive);
    case 'ref':
      return type.typeName;
    case 'array':
      return `List[${typeString(type.of)}]`;
    case 'unknown':
      return 'Any';
  }
}

function containsUnknown(type: FieldValueType): boolean {
  return type.kind === 'unknown' || (type.kind === 'array' && containsUnknown(type.of));
}

function emitField(field: ModelField): string {
  const name = toSnakeCase(field.key);
  const baseType = typeString(field.type);
  const type = field.nullable ? `Optional[${baseType}]` : baseType;
  const defaultValue = field.nullable ? ' = None' : '';
  const comment = name !== field.key ? `  # JSON key: "${field.key}"` : '';
  return `    ${name}: ${type}${defaultValue}${comment}`;
}

export function emitPython(model: FlattenedModel): EmitResult {
  const usesOptional = model.definitions.some((definition) => definition.fields.some((field) => field.nullable));
  const usesList = model.definitions.some((definition) => definition.fields.some((field) => field.type.kind === 'array'));
  const usesAny = model.definitions.some((definition) => definition.fields.some((field) => containsUnknown(field.type)));

  const typingImports = [usesAny ? 'Any' : '', usesList ? 'List' : '', usesOptional ? 'Optional' : ''].filter((name) => name !== '');
  const typingLine = typingImports.length > 0 ? `from typing import ${typingImports.join(', ')}\n` : '';

  const blocks = model.definitions.map((definition) => {
    const fields = definition.fields.length > 0 ? definition.fields.map(emitField).join('\n') : '    pass';
    return `@dataclass\nclass ${definition.name}:\n${fields}`;
  });

  const warnings =
    model.definitions.some((definition) => definition.fields.some((field) => toSnakeCase(field.key) !== field.key))
      ? ['A plain @dataclass cannot remap JSON keys by itself — fields whose name changed from the original JSON key are annotated with a comment; use `dataclasses-json` or manual (de)serialization to actually apply that mapping.']
      : [];

  return { code: `from dataclasses import dataclass\n${typingLine}\n\n${blocks.join('\n\n\n')}`, warnings };
}
