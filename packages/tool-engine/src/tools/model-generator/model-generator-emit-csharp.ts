import { toPascalCase } from "./model-generator-naming.js";
import { EmitResult, FieldPrimitive, FieldValueType, FlattenedModel, ModelField } from "./model-generator-types.js";

function primitiveType(primitive: FieldPrimitive): string {
  switch (primitive) {
    case 'string':
      return 'string';
    case 'integer':
      return 'int';
    case 'number':
      return 'double';
    case 'boolean':
      return 'bool';
    default:
      return 'object';
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
      return 'object';
  }
}

function emitProperty(field: ModelField): string {
  const propertyName = toPascalCase(field.key);
  const nullableSuffix = field.nullable ? '?' : '';
  const attribute = propertyName !== field.key ? `    [JsonPropertyName("${field.key}")]\n` : '';
  return `${attribute}    public ${typeString(field.type)}${nullableSuffix} ${propertyName} { get; set; }`;
}

export function emitCSharp(model: FlattenedModel): EmitResult {
  const usesAttribute = model.definitions.some((definition) => definition.fields.some((field) => toPascalCase(field.key) !== field.key));
  const usesList = model.definitions.some((definition) => definition.fields.some((field) => field.type.kind === 'array'));

  const usings = [usesAttribute ? 'using System.Text.Json.Serialization;' : '', usesList ? 'using System.Collections.Generic;' : ''].filter(
    (line) => line !== '',
  );

  const blocks = model.definitions.map((definition) => {
    const fields = definition.fields.map(emitProperty).join('\n\n');
    return `public class ${definition.name}\n{\n${fields}\n}`;
  });

  const header = usings.length > 0 ? `${usings.join('\n')}\n\n` : '';
  return { code: header + blocks.join('\n\n'), warnings: [] };
}
