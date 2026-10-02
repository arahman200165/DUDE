/** Pure, framework-free conversion between a `docker run` command and a single-service docker-compose YAML block. */
import { dump as dumpYaml, load as loadYaml } from 'js-yaml';

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (const char of input) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current !== '') {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current !== '') tokens.push(current);
  return tokens;
}

const NO_VALUE_FLAGS = new Set(['-d', '--detach', '-i', '--interactive', '-t', '--tty', '-it', '--rm']);
const VALUE_FLAGS: Record<string, 'ports' | 'envs' | 'volumes' | 'name' | 'restart'> = {
  '-p': 'ports',
  '--publish': 'ports',
  '-e': 'envs',
  '--env': 'envs',
  '-v': 'volumes',
  '--volume': 'volumes',
  '--name': 'name',
  '--restart': 'restart',
};

export interface DockerRunSpec {
  readonly image: string;
  readonly name?: string;
  readonly ports: readonly string[];
  readonly envs: readonly string[];
  readonly volumes: readonly string[];
  readonly restart?: string;
  readonly command: readonly string[];
}

export type ParseDockerRunResult = { readonly ok: true; readonly spec: DockerRunSpec } | { readonly ok: false; readonly error: string };

export function parseDockerRun(command: string): ParseDockerRunResult {
  if (command.trim() === '') return { ok: false, error: 'Enter a docker run command.' };

  const tokens = tokenize(command.trim());
  let i = 0;
  if (tokens[i] === 'docker') i++;
  if (tokens[i] !== 'run') return { ok: false, error: 'Expected a "docker run" command.' };
  i++;

  const ports: string[] = [];
  const envs: string[] = [];
  const volumes: string[] = [];
  let name: string | undefined;
  let restart: string | undefined;

  while (i < tokens.length) {
    const token = tokens[i];
    if (NO_VALUE_FLAGS.has(token)) {
      i++;
      continue;
    }
    const kind = VALUE_FLAGS[token];
    if (kind) {
      const value = tokens[i + 1];
      i += 2;
      if (kind === 'ports') ports.push(value);
      else if (kind === 'envs') envs.push(value);
      else if (kind === 'volumes') volumes.push(value);
      else if (kind === 'name') name = value;
      else restart = value;
      continue;
    }
    break;
  }

  const image = tokens[i];
  if (!image) return { ok: false, error: 'No image found in the command.' };
  const command_ = tokens.slice(i + 1);

  return { ok: true, spec: { image, name, ports, envs, volumes, restart, command: command_ } };
}

export type ConvertResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: string };

export function dockerRunToCompose(command: string, serviceName: string): ConvertResult {
  const parsed = parseDockerRun(command);
  if (!parsed.ok) return parsed;

  const { spec } = parsed;
  const service: Record<string, unknown> = { image: spec.image };
  if (spec.name) service['container_name'] = spec.name;
  if (spec.ports.length > 0) service['ports'] = spec.ports;
  if (spec.envs.length > 0) service['environment'] = spec.envs;
  if (spec.volumes.length > 0) service['volumes'] = spec.volumes;
  if (spec.restart) service['restart'] = spec.restart;
  if (spec.command.length > 0) service['command'] = spec.command.join(' ');

  return { ok: true, output: dumpYaml({ services: { [serviceName.trim() || 'app']: service } }) };
}

function quoteIfNeeded(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

export function composeToDockerRun(yamlText: string, serviceName: string): ConvertResult {
  if (yamlText.trim() === '') return { ok: false, error: 'Enter a docker-compose YAML document.' };

  let doc: unknown;
  try {
    doc = loadYaml(yamlText);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to parse YAML.' };
  }

  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, error: 'A docker-compose file must be a YAML mapping (object) at the top level.' };
  }
  const services = (doc as Record<string, unknown>)['services'];
  if (services === undefined || services === null || typeof services !== 'object' || Array.isArray(services)) {
    return { ok: false, error: 'No "services" mapping found.' };
  }

  const names = Object.keys(services as Record<string, unknown>);
  const chosenName = serviceName.trim() !== '' && names.includes(serviceName.trim()) ? serviceName.trim() : names[0];
  if (!chosenName) return { ok: false, error: 'No services found.' };

  const service = (services as Record<string, unknown>)[chosenName] as Record<string, unknown>;
  const parts: string[] = ['docker', 'run'];

  if (typeof service['container_name'] === 'string') parts.push('--name', service['container_name']);

  for (const port of (service['ports'] as readonly unknown[] | undefined) ?? []) {
    parts.push('-p', String(port));
  }

  const environment = service['environment'];
  if (Array.isArray(environment)) {
    for (const entry of environment) parts.push('-e', String(entry));
  } else if (environment !== null && typeof environment === 'object') {
    for (const [key, value] of Object.entries(environment as Record<string, unknown>)) parts.push('-e', `${key}=${value}`);
  }

  for (const volume of (service['volumes'] as readonly unknown[] | undefined) ?? []) {
    parts.push('-v', String(volume));
  }

  if (typeof service['restart'] === 'string') parts.push('--restart', service['restart']);

  parts.push(String(service['image'] ?? 'IMAGE'));

  const command = service['command'];
  if (Array.isArray(command)) parts.push(...command.map(String));
  else if (typeof command === 'string') parts.push(...command.split(/\s+/));

  return { ok: true, output: parts.map(quoteIfNeeded).join(' ') };
}
