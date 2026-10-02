import { composeToDockerRun, dockerRunToCompose, parseDockerRun } from "./docker-run-compose-converter-logic.js";

describe('parseDockerRun', () => {
  it('parses flags, image, and trailing command', () => {
    const result = parseDockerRun('docker run -p 8080:80 -e FOO=bar --name web nginx:1.27 nginx -g "daemon off;"');
    expect(result).toEqual({
      ok: true,
      spec: { image: 'nginx:1.27', name: 'web', ports: ['8080:80'], envs: ['FOO=bar'], volumes: [], restart: undefined, command: ['nginx', '-g', 'daemon off;'] },
    });
  });

  it('rejects a non "docker run" command', () => {
    expect(parseDockerRun('docker ps').ok).toBe(false);
  });

  it('rejects a command with no image', () => {
    expect(parseDockerRun('docker run -p 8080:80').ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(parseDockerRun('').ok).toBe(false);
  });
});

describe('dockerRunToCompose', () => {
  it('emits a compose service block', () => {
    const result = dockerRunToCompose('docker run -p 8080:80 -e FOO=bar nginx:1.27', 'app');
    expect(result).toEqual({
      ok: true,
      output: 'services:\n  app:\n    image: nginx:1.27\n    ports:\n      - 8080:80\n    environment:\n      - FOO=bar\n',
    });
  });
});

describe('composeToDockerRun', () => {
  it('round-trips a compose service back into a docker run command', () => {
    const compose = 'services:\n  app:\n    image: nginx:1.27\n    ports:\n      - "8080:80"\n    environment:\n      - FOO=bar\n';
    const result = composeToDockerRun(compose, 'app');
    expect(result).toEqual({ ok: true, output: 'docker run -p 8080:80 -e FOO=bar nginx:1.27' });
  });

  it('handles a mapping-style environment block', () => {
    const compose = 'services:\n  app:\n    image: nginx\n    environment:\n      FOO: bar\n';
    const result = composeToDockerRun(compose, 'app');
    expect(result).toEqual({ ok: true, output: 'docker run -e FOO=bar nginx' });
  });

  it('defaults to the first service when the named one is not found', () => {
    const compose = 'services:\n  web:\n    image: nginx\n';
    const result = composeToDockerRun(compose, 'nonexistent');
    expect(result).toEqual({ ok: true, output: 'docker run nginx' });
  });

  it('rejects a document with no services', () => {
    expect(composeToDockerRun('foo: bar\n', '').ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(composeToDockerRun('', '').ok).toBe(false);
  });
});
