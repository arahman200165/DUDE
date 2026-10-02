import { X509NameField } from "../../shared/utils/x509-fields.js";
export function Pkcs12Inspector_dnSummary(fields: readonly X509NameField[]): string {
    return fields.map((f) => `${f.shortName || f.name}=${f.value}`).join(', ');
}
