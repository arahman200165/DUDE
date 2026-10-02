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
      return 'Boolean';
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
      return `List<${typeString(type.of)}>`;
    case 'unknown':
      return 'Any';
  }
}

function emitParam(field: ModelField): string {
  const name = toCamelCase(field.key);
  const annotation = name !== field.key ? `@SerialName("${field.key}") ` : '';
  const nullableSuffix = field.nullable ? '?' : '';
  const defaultValue = field.nullable ? ' = null' : '';
  return `    ${annotation}val ${name}: ${typeString(field.type)}${nullableSuffix}${defaultValue}`;
}

export function emitKotlin(model: FlattenedModel): EmitResult {
  const usesSerialName = model.definitions.some((definition) => definition.fields.some((field) => toCamelCase(field.key) !== field.key));

  const imports = ['import kotlinx.serialization.Serializable', usesSerialName ? 'import kotlinx.serialization.SerialName' : ''].filter(
    (line) => line !== '',
  );

  const blocks = model.definitions.map((definition) => {
    const params = definition.fields.map(emitParam).join(',\n');
    return `@Serializable\ndata class ${definition.name}(\n${params}\n)`;
  });

  return { code: `${imports.join('\n')}\n\n${blocks.join('\n\n')}`, warnings: [] };
}
