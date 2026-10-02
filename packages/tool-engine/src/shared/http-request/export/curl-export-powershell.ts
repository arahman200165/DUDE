import { ParsedHttpRequest, buildFullUrl } from "@dude/domain/shared/http-request/http-request.model";

function psSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Generates a PowerShell snippet using Invoke-RestMethod (auto-deserializes
 * JSON responses, matching the typical API-testing use case). Use
 * Invoke-WebRequest instead when raw response/header access is needed.
 */
export function generatePowerShell(request: ParsedHttpRequest): string {
  const lines: string[] = [];

  if (request.headers.length > 0) {
    lines.push('$headers = @{');
    for (const header of request.headers) {
      lines.push(`    ${psSingleQuote(header.key)} = ${psSingleQuote(header.value)}`);
    }
    lines.push('}', '');
  }

  const args = [`-Uri ${psSingleQuote(buildFullUrl(request))}`, `-Method ${request.method}`];
  if (request.headers.length > 0) args.push('-Headers $headers');

  if (request.body.kind === 'raw' && request.body.text !== '') {
    lines.push(`$body = ${psSingleQuote(request.body.text)}`, '');
    args.push('-Body $body');
  } else if (request.body.kind === 'multipart') {
    lines.push('$form = @{');
    for (const field of request.body.fields) {
      lines.push(`    ${psSingleQuote(field.key)} = ${psSingleQuote(field.value)}`);
    }
    lines.push('}', '');
    args.push('-Form $form');
  }

  if (request.auth) {
    lines.push(
      `$securePassword = ConvertTo-SecureString ${psSingleQuote(request.auth.password)} -AsPlainText -Force`,
      `$credential = New-Object System.Management.Automation.PSCredential(${psSingleQuote(request.auth.username)}, $securePassword)`,
      '',
    );
    args.push('-Authentication Basic', '-Credential $credential');
  }

  lines.push(`Invoke-RestMethod ${args.join(' ')}`);

  return lines.join('\n');
}
