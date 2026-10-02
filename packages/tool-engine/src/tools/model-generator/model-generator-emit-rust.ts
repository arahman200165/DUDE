import { toSnakeCase } from "./model-generator-naming.js";
import { EmitResult, FieldPrimitive, FieldValueType, FlattenedModel, ModelField } from "./model-generator-types.js";

function primitiveType(primitive: FieldPrimitive): string {
  switch (primitive) {
    case 'string':
      return 'String';
    case 'integer':
      return 'i64';
    case 'number':
      return 'f64';
    case 'boolean':
      return 'bool';
    default:
      return 'serde_json::Value';
  }
}

function typeString(type: FieldValueType): string {
  switch (type.kind) {
    case 'primitive':
      return primitiveType(type.primitive);
    case 'ref':
      return type.typeName;
    case 'array':
      return `Vec<${typeString(type.of)}>`;
    case 'unknown':
      return 'serde_json::Value';
  }
}

function containsUnknown(type: FieldValueType): boolean {
  return type.kind === 'unknown' || (type.kind === 'array' && containsUnknown(type.of));
}

function emitField(field: ModelField): string {
  const name = toSnakeCase(field.key);
  const baseType = typeString(field.type);
  const type = field.nullable ? `Option<${baseType}>` : baseType;
  const rename = name !== field.key ? `    #[serde(rename = "${field.key}")]\n` : '';
  return `${rename}    pub ${name}: ${type},`;
}

export function emitRust(model: FlattenedModel): EmitResult {
  const usesSerdeJsonValue = model.definitions.some((definition) => definition.fields.some((field) => containsUnknown(field.type)));

  const warnings = usesSerdeJsonValue
    ? ['A field with no consistent inferred type falls back to `serde_json::Value`, which requires the `serde_json` crate as a dependency.']
    : [];

  const blocks = model.definitions.map((definition) => {
    const fields = definition.fields.map(emitField).join('\n');
    return `#[derive(Debug, Serialize, Deserialize)]\npub struct ${definition.name} {\n${fields}\n}`;
  });

  return { code: `use serde::{Deserialize, Serialize};\n\n${blocks.join('\n\n')}`, warnings };
}
