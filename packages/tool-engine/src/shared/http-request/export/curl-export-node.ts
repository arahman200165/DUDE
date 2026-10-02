import { ParsedHttpRequest, buildFullUrl } from "@dude/domain/shared/http-request/http-request.model";

/** Generates a Node.js snippet using axios (a common REST-client dependency, not a core-`http` snippet). */
export function generateNode(request: ParsedHttpRequest): string {
  const lines: string[] = ['// npm install axios', "const axios = require('axios');", ''];

  if (request.body.kind === 'multipart') {
    lines.push("const FormData = require('form-data');", 'const formData = new FormData();');
    for (const field of request.body.fields) {
      lines.push(`formData.append(${JSON.stringify(field.key)}, ${JSON.stringify(field.value)});`);
    }
    lines.push('');
  }

  const configLines: string[] = [
    `  method: ${JSON.stringify(request.method.toLowerCase())},`,
    `  url: ${JSON.stringify(buildFullUrl(request))},`,
  ];

  if (request.headers.length > 0) {
    configLines.push('  headers: {');
    for (const header of request.headers) {
      configLines.push(`    ${JSON.stringify(header.key)}: ${JSON.stringify(header.value)},`);
    }
    configLines.push('  },');
  }

  if (request.auth) {
    configLines.push(
      '  auth: {',
      `    username: ${JSON.stringify(request.auth.username)},`,
      `    password: ${JSON.stringify(request.auth.password)},`,
      '  },',
    );
  }

  if (request.body.kind === 'raw' && request.body.text !== '') {
    configLines.push(`  data: ${JSON.stringify(request.body.text)},`);
  } else if (request.body.kind === 'multipart') {
    configLines.push('  data: formData,');
  }

  lines.push(
    'axios({',
    ...configLines,
    '})',
    '  .then((response) => console.log(response.status, response.data))',
    '  .catch((error) => console.error(error));',
  );

  return lines.join('\n');
}
