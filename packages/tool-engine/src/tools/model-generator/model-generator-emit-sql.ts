import { toSnakeCase } from "./model-generator-naming.js";
import { EmitResult, FieldValueType, FlattenedModel, ModelDefinition, ModelField } from "./model-generator-types.js";

interface ColumnType {
  readonly sqlType: string;
  readonly nested: boolean;
}

function columnType(type: FieldValueType): ColumnType {
  if (type.kind !== 'primitive') {
    // Nested object/array/unresolved shapes have no flat column equivalent — stored as TEXT.
    return { sqlType: 'TEXT', nested: true };
  }

  switch (type.primitive) {
    case 'string':
      return { sqlType: 'VARCHAR(255)', nested: false };
    case 'integer':
      return { sqlType: 'INTEGER', nested: false };
    case 'number':
      return { sqlType: 'DOUBLE PRECISION', nested: false };
    case 'boolean':
      return { sqlType: 'BOOLEAN', nested: false };
    default:
      return { sqlType: 'TEXT', nested: false };
  }
}

function emitColumn(field: ModelField): { line: string; warning: string | null } {
  const columnName = toSnakeCase(field.key);
  const { sqlType, nested } = columnType(field.type);
  const nullSuffix = field.nullable ? '' : ' NOT NULL';
  const warning = nested
    ? `Column "${columnName}" holds nested object/array data with no flat SQL equivalent — stored as TEXT (JSON-encode the value before inserting); consider a JSON column type or a separate related table instead.`
    : null;
  return { line: `  ${columnName} ${sqlType}${nullSuffix}`, warning };
}

/**
 * Only the root type becomes a table — SQL has no equivalent of "just add another interface" for
 * nested definitions, so any nested object/array field is flattened to a TEXT column with a warning
 * rather than silently generating extra, possibly unwanted, related tables.
 */
export function emitSql(model: FlattenedModel): EmitResult {
  const root: ModelDefinition = model.definitions.find((definition) => definition.name === model.rootName) ?? {
    name: model.rootName,
    fields: [],
  };

  const tableName = toSnakeCase(root.name);
  const columns = root.fields.map(emitColumn);
  const idColumn = '  id INTEGER PRIMARY KEY';
  const body = [idColumn, ...columns.map((c) => c.line)].join(',\n');

  const warnings = columns.map((c) => c.warning).filter((warning): warning is string => warning !== null);
  if (model.definitions.length > 1) {
    warnings.push('Only the root object became a table — nested objects/arrays elsewhere in the input were not turned into additional tables.');
  }

  return { code: `CREATE TABLE ${tableName} (\n${body}\n);`, warnings };
}
