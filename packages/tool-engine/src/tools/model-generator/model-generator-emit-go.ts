import { toPascalCase } from "./model-generator-naming.js";
import { EmitResult, FieldPrimitive, FieldValueType, FlattenedModel, ModelField } from "./model-generator-types.js";

function primitiveType(primitive: FieldPrimitive): string {
  switch (primitive) {
    case 'string':
      return 'string';
    case 'integer':
      return 'int64';
    case 'number':
      return 'float64';
    case 'boolean':
      return 'bool';
    default:
      return 'interface{}';
  }
}

function typeString(type: FieldValueType, nullable: boolean): string {
  switch (type.kind) {
    case 'primitive':
      // Pointer-wrap only nullable primitives — a nil slice/pointer struct already models "absent"
      // for reference-like array/object fields without needing a pointer indirection.
      return nullable ? `*${primitiveType(type.primitive)}` : primitiveType(type.primitive);
    case 'ref':
      return type.typeName;
    case 'array':
      return `[]${typeString(type.of, false)}`;
    case 'unknown':
      return 'interface{}';
  }
}

function emitField(field: ModelField): string {
  const name = toPascalCase(field.key);
  const type = typeString(field.type, field.nullable);
  const tagOptions = field.nullable ? `${field.key},omitempty` : field.key;
  return `    ${name} ${type} \`json:"${tagOptions}"\``;
}

export function emitGo(model: FlattenedModel): EmitResult {
  const blocks = model.definitions.map((definition) => {
    const fields = definition.fields.map(emitField).join('\n');
    return `type ${definition.name} struct {\n${fields}\n}`;
  });

  return { code: blocks.join('\n\n'), warnings: [] };
}
