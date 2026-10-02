import { toCamelCase } from "./model-generator-naming.js";
import { EmitResult, FieldPrimitive, FieldValueType, FlattenedModel, ModelField } from "./model-generator-types.js";

function primitiveType(primitive: FieldPrimitive): string {
  switch (primitive) {
    case 'string':
      return 'String';
    case 'integer':
      return 'Integer';
    case 'number':
      return 'Double';
    case 'boolean':
      return 'Boolean';
    default:
      return 'Object';
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
      return 'Object';
  }
}

function emitField(field: ModelField): { declaration: string; accessors: string } {
  const name = toCamelCase(field.key);
  const type = typeString(field.type);
  const annotation = name !== field.key ? `    @JsonProperty("${field.key}")\n` : '';
  const capitalized = name.charAt(0).toUpperCase() + name.slice(1);

  return {
    declaration: `${annotation}    private ${type} ${name};`,
    accessors: `    public ${type} get${capitalized}() {\n        return ${name};\n    }\n\n    public void set${capitalized}(${type} ${name}) {\n        this.${name} = ${name};\n    }`,
  };
}

export function emitJava(model: FlattenedModel): EmitResult {
  const usesAnnotation = model.definitions.some((definition) => definition.fields.some((field) => toCamelCase(field.key) !== field.key));
  const usesList = model.definitions.some((definition) => definition.fields.some((field) => field.type.kind === 'array'));

  const imports = [usesAnnotation ? 'import com.fasterxml.jackson.annotation.JsonProperty;' : '', usesList ? 'import java.util.List;' : ''].filter(
    (line) => line !== '',
  );

  const blocks = model.definitions.map((definition) => {
    const parts = definition.fields.map(emitField);
    const declarations = parts.map((p) => p.declaration).join('\n');
    const accessors = parts.map((p) => p.accessors).join('\n\n');
    const body = [declarations, accessors].filter((section) => section !== '').join('\n\n');
    return `public class ${definition.name} {\n${body}\n}`;
  });

  const header = imports.length > 0 ? `${imports.join('\n')}\n\n` : '';
  return { code: header + blocks.join('\n\n'), warnings: [] };
}
