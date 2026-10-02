import { toCamelCase } from "./model-generator-naming.js";
import { EmitResult, FieldPrimitive, FieldValueType, FlattenedModel, ModelField } from "./model-generator-types.js";

function primitiveType(primitive: FieldPrimitive): string {
  switch (primitive) {
    case 'string':
      return 'String';
    case 'integer':
      return 'Int';
    case 'number':
      return 'Double';
    case 'boolean':
      return 'Bool';
    default:
      return 'AnyCodable';
  }
}

function typeString(type: FieldValueType): string {
  switch (type.kind) {
    case 'primitive':
      return primitiveType(type.primitive);
    case 'ref':
      return type.typeName;
    case 'array':
      return `[${typeString(type.of)}]`;
    case 'unknown':
      return 'AnyCodable';
  }
}

function propertyName(field: ModelField): string {
  return toCamelCase(field.key);
}

function emitProperty(field: ModelField): string {
  const nullableSuffix = field.nullable ? '?' : '';
  return `    let ${propertyName(field)}: ${typeString(field.type)}${nullableSuffix}`;
}

export function emitSwift(model: FlattenedModel): EmitResult {
  const warnings = model.definitions.some((definition) => definition.fields.some((field) => field.type.kind === 'unknown'))
    ? ['Fields with no consistent inferred type fall back to a placeholder `AnyCodable` type — define one, or replace it with a concrete type, before compiling.']
    : [];

  const blocks = model.definitions.map((definition) => {
    const properties = definition.fields.map(emitProperty).join('\n');
    const needsCodingKeys = definition.fields.some((field) => propertyName(field) !== field.key);

    const codingKeys = needsCodingKeys
      ? `\n\n    enum CodingKeys: String, CodingKey {\n${definition.fields
          .map((field) => {
            const name = propertyName(field);
            return name === field.key ? `        case ${name}` : `        case ${name} = "${field.key}"`;
          })
          .join('\n')}\n    }`
      : '';

    return `struct ${definition.name}: Codable {\n${properties}${codingKeys}\n}`;
  });

  return { code: blocks.join('\n\n'), warnings };
}
