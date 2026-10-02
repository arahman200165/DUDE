/**
 * Pure, framework-free XSD validation used by the XML Schema / XSD Validator
 * tool, via `xmllint-wasm` (libxml2 compiled to WebAssembly) — the only
 * realistic option for real XSD validation in the browser. Async because
 * instantiating the WASM module is async; `xmllint-wasm`'s browser build
 * already runs the actual validation in its own internal Worker, so this
 * tool does not add another `WorkerClientService` layer on top.
 *
 * `validateXML` never throws for a merely invalid XML document or a schema
 * violation — both come back as `{ valid: false, errors: [...] }`. It only
 * throws when the *schema itself* fails to compile.
 */

import { validateXML } from 'xmllint-wasm';

export interface XsdValidationIssue {
  readonly message: string;
  readonly line: number | null;
}

export interface XsdValidateError {
  readonly message: string;
}

export type XsdValidateResult =
  | { readonly ok: true; readonly valid: boolean; readonly issues: readonly XsdValidationIssue[] }
  | { readonly ok: false; readonly error: XsdValidateError };

export async function validateAgainstXsd(xmlInput: string, xsdInput: string): Promise<XsdValidateResult> {
  if (xmlInput.trim() === '') return { ok: false, error: { message: 'Enter some XML.' } };
  if (xsdInput.trim() === '') return { ok: false, error: { message: 'Enter an XSD schema.' } };

  try {
    const result = await validateXML({ xml: xmlInput, schema: xsdInput });
    return {
      ok: true,
      valid: result.valid,
      issues: result.errors.map((error) => ({ message: error.message, line: error.loc?.lineNumber ?? null })),
    };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
