import { REGISTRY_HIVES, type RegistrySearchMatch, type RegistrySearchResult, type RegistrySubkey, type RegistryValue, type RegistryValueType, type RegistryView } from "@dude/contracts/system/system-types";
import {
  EDITABLE_TYPES, TOOL_ID, createKeyRequest, decodeRegBytes, deleteValueRequest, displayPath, encodeUtf16leWithBom, exportFileName, joinPath, keyId,
  longPath, needsElevation, parseRegistryPath, parseValueText, powerShellCommand, regExeCommand, setValueRequest, subtreeOf, validateKeyName, valueLabel, valueToText,
  type KeyRef,
} from "./registry-editor-logic.js";
export function RegistryEditorTool_matchLabel(m: RegistrySearchMatch): string {
    if (m.matchIn === 'key')
        return 'key name';
    return `${m.matchIn === 'value-name' ? 'value name' : 'value data'}: ${valueLabel(m.valueName ?? '')}`;
}
