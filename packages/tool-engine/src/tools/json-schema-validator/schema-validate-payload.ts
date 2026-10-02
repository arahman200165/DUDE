import { SchemaDraftMode } from "./schema-validate.js";

export interface SchemaValidatePayload {
  readonly schemaText: string;
  readonly instanceText: string;
  readonly draftMode: SchemaDraftMode;
}
