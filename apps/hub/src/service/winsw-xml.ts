import path from 'node:path';
import { SERVICE_DISPLAY_NAME, SERVICE_NAME } from './common.js';

export const xmlEscape = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Quotes one command-line argument for the WinSW `<arguments>` string (paths with spaces). */
export function quoteArg(value: string): string {
  if (value.includes('"')) throw new Error('A path containing a double quote cannot be used as a service argument.');
  return /[\s]/.test(value) ? `"${value}"` : value;
}

export interface ServiceXmlOptions {
  dataDir: string;
}

/** WinSW 2.x configuration for the Hub service. `%BASE%` is the directory holding DudeHub.exe. */
export function buildServiceXml(options: ServiceXmlOptions): string {
  const args = `run --data-dir ${quoteArg(options.dataDir)}`;
  const logPath = path.join(options.dataDir, 'logs', 'service');
  const lines = [
    '<service>',
    `  <id>${xmlEscape(SERVICE_NAME)}</id>`,
    `  <name>${xmlEscape(SERVICE_DISPLAY_NAME)}</name>`,
    '  <description>Self-hosted DUDE Hub: owner identity, device registry and synchronized state for your own devices.</description>',
    '  <executable>%BASE%\\dude-hub.exe</executable>',
    `  <arguments>${xmlEscape(args)}</arguments>`,
    '  <startmode>Automatic</startmode>',
    '  <delayedAutoStart>true</delayedAutoStart>',
    '  <onfailure action="restart" delay="10 sec"/>',
    '  <onfailure action="restart" delay="10 sec"/>',
    '  <onfailure action="restart" delay="10 sec"/>',
    '  <onfailure action="none"/>',
    '  <resetfailure>1 hour</resetfailure>',
    '  <stoptimeout>15 sec</stoptimeout>',
    `  <logpath>${xmlEscape(logPath)}</logpath>`,
    '  <log mode="roll-by-size">',
    '    <sizeThreshold>10240</sizeThreshold>',
    '    <keepFiles>5</keepFiles>',
    '  </log>',
    '</service>',
  ];
  return `${lines.join('\r\n')}\r\n`;
}
