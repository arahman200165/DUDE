/** Minimal declarations for the Electron utility-process globals; the agent never imports `electron`. */
interface UtilityMessagePort {
  on(event: 'message', listener: (event: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
  start(): void;
  close(): void;
}

interface UtilityParentPort {
  once(event: 'message', listener: (event: { data: unknown; ports: UtilityMessagePort[] }) => void): void;
}

declare namespace NodeJS {
  interface Process {
    parentPort?: UtilityParentPort;
  }
}
