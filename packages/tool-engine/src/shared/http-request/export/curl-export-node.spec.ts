import { ParsedHttpRequest } from "@dude/domain/shared/http-request/http-request.model";
import { generateNode } from "./curl-export-node.js";

const REQUEST: ParsedHttpRequest = {
  method: 'POST',
  url: 'https://api.example.com/users',
  queryParams: [],
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  body: { kind: 'raw', text: '{"name":"a"}', contentType: 'application/json' },
  auth: null,
};

describe('generateNode', () => {
  it('generates an axios call with method, headers, and body', () => {
    expect(generateNode(REQUEST)).toBe(
      [
        '// npm install axios',
        "const axios = require('axios');",
        '',
        'axios({',
        '  method: "post",',
        '  url: "https://api.example.com/users",',
        '  headers: {',
        '    "Content-Type": "application/json",',
        '  },',
        '  data: "{\\"name\\":\\"a\\"}",',
        '})',
        '  .then((response) => console.log(response.status, response.data))',
        '  .catch((error) => console.error(error));',
      ].join('\n'),
    );
  });

  it('builds a FormData body for multipart requests and an auth object for basic auth', () => {
    const request: ParsedHttpRequest = {
      method: 'POST',
      url: 'https://example.com/upload',
      queryParams: [],
      headers: [],
      body: { kind: 'multipart', fields: [{ key: 'name', value: 'value' }] },
      auth: { username: 'alice', password: 'secret' },
    };

    const result = generateNode(request);
    expect(result).toContain("const FormData = require('form-data');");
    expect(result).toContain('formData.append("name", "value");');
    expect(result).toContain('data: formData,');
    expect(result).toContain('username: "alice",');
    expect(result).toContain('password: "secret",');
  });
});
