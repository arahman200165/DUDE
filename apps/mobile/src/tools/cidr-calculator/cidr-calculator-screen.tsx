import { defineTextTool } from '../../kit';
import { cidrRows } from './cidr-calculator-mobile';

/** IPv4 only, like the web tool (the engine has no IPv6 prefix arithmetic). The web tool persists only its session input; there are no preferences. */
export default defineTextTool({
  toolId: 'cidr-calculator',
  outputKind: 'kv',
  inputLabel: 'IPv4 address / prefix length',
  sampleInput: '192.168.1.10/24',
  run: input => cidrRows(input),
});
