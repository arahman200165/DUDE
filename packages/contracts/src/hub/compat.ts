export type ProtocolCompatibility = 'compatible' | 'client-too-old' | 'hub-too-old';

/** The client is too old when the hub demands a newer protocol; the hub is too old when it cannot meet the client's floor. */
export function checkProtocolCompatibility(
  hello: { protocolVersion: number; minClientProtocol: number },
  client: { protocolVersion: number; minHubProtocol: number },
): ProtocolCompatibility {
  if (client.protocolVersion < hello.minClientProtocol) return 'client-too-old';
  if (hello.protocolVersion < client.minHubProtocol) return 'hub-too-old';
  return 'compatible';
}
