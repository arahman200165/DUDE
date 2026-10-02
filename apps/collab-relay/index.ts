import { createRelayServer } from './server';

const port = Number(process.env['PORT'] ?? 8080);
const { httpServer } = createRelayServer();

httpServer.listen(port, () => {
  console.log(`DUDE collab relay listening on port ${port}`);
});
