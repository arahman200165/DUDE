export { MAX_FRAME_BYTES, MAX_HANDSHAKE_FRAME_BYTES, FrameDecoder, ProtocolError, encodeFrame } from './framing.js';
export { SECRET_BYTES, SECRET_FILE, agentEndpoint, agentSecretPath, ensureAgentSecret, readAgentSecret } from './endpoint.js';
export { HANDSHAKE_TIMEOUT_MS, PIPE_PROTOCOL, clientProof, serverProof } from './handshake.js';
export type { AgentClientConfig } from './handshake.js';
export { createAgentPipeServer } from './server.js';
export type { AgentPipeConnection, AgentPipeServerOptions, AgentPipeServerResult } from './server.js';
export { AgentConnectError, connectAgentPipe } from './client.js';
export type { AgentPipeClient, ConnectAgentPipeOptions } from './client.js';
