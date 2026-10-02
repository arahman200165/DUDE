import { ParsedHttpRequest } from "@dude/domain/shared/http-request/http-request.model";
import { generateGo } from "./curl-export-go.js";

const REQUEST: ParsedHttpRequest = {
  method: 'POST',
  url: 'https://api.example.com/users',
  queryParams: [],
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  body: { kind: 'raw', text: '{"name":"a"}', contentType: 'application/json' },
  auth: null,
};

describe('generateGo', () => {
  it('generates a net/http snippet with a strings.Reader body and a header', () => {
    expect(generateGo(REQUEST)).toBe(
      [
        'package main',
        '',
        'import (',
        '\t"fmt"',
        '\t"io"',
        '\t"net/http"',
        '\t"strings"',
        ')',
        '',
        'func main() {',
        '\tbody := strings.NewReader("{\\"name\\":\\"a\\"}")',
        '\treq, err := http.NewRequest("POST", "https://api.example.com/users", body)',
        '\tif err != nil {',
        '\t\tpanic(err)',
        '\t}',
        '',
        '\treq.Header.Set("Content-Type", "application/json")',
        '',
        '\tresp, err := http.DefaultClient.Do(req)',
        '\tif err != nil {',
        '\t\tpanic(err)',
        '\t}',
        '\tdefer resp.Body.Close()',
        '',
        '\trespBody, _ := io.ReadAll(resp.Body)',
        '\tfmt.Println(resp.StatusCode, string(respBody))',
        '}',
      ].join('\n'),
    );
  });

  it('builds a mime/multipart writer for multipart requests and calls SetBasicAuth for basic auth', () => {
    const request: ParsedHttpRequest = {
      method: 'POST',
      url: 'https://example.com/upload',
      queryParams: [],
      headers: [],
      body: { kind: 'multipart', fields: [{ key: 'name', value: 'value' }] },
      auth: { username: 'alice', password: 'secret' },
    };

    const result = generateGo(request);
    expect(result).toContain('"mime/multipart"');
    expect(result).toContain('writer := multipart.NewWriter(&buf)');
    expect(result).toContain('writer.WriteField("name", "value")');
    expect(result).toContain('req.SetBasicAuth("alice", "secret")');
  });
});
