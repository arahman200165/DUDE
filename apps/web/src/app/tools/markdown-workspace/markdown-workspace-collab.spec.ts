import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MarkdownCollabClient } from "@dude/tool-engine/tools/markdown-workspace/collab/markdown-collab-client";
import { MARKDOWN_WORKSPACE_TOOL_ID, RELAY_URL_KEY } from "@dude/tool-engine/tools/markdown-workspace/markdown-workspace-relay";
import { WorkspaceLayoutService } from '../../core/workspace/workspace-layout.service';
import { CodeEditor } from '../../shared/components/code-editor/code-editor';
import { CODE_EDITOR_ENGINE_LOADER } from '../../shared/components/code-editor/code-editor.loader';
import { stubEditorLayout } from '../../shared/components/code-editor/testing/stub-layout';
import { MarkdownWorkspace } from './markdown-workspace';

/** Pairs every socket opened on the same URL and relays `send()` as a `message` on the others (the relay's job). */
class FakeSocketHub {
  readonly byUrl = new Map<string, FakeWebSocket[]>();
}

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static hub: FakeSocketHub;

  readyState = FakeWebSocket.CONNECTING;
  binaryType = '';
  private readonly listeners = new Map<string, ((event: { data?: unknown }) => void)[]>();

  constructor(readonly url: string) {
    const list = FakeWebSocket.hub.byUrl.get(url) ?? [];
    list.push(this);
    FakeWebSocket.hub.byUrl.set(url, list);
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.dispatch('open', {});
    });
  }

  addEventListener(type: string, callback: (event: { data?: unknown }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), callback]);
  }

  send(data: ArrayBuffer): void {
    for (const peer of FakeWebSocket.hub.byUrl.get(this.url) ?? []) {
      if (peer !== this) queueMicrotask(() => peer.dispatch('message', { data }));
    }
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatch('close', {});
  }

  private dispatch(type: string, event: { data?: unknown }): void {
    for (const callback of this.listeners.get(type) ?? []) callback(event);
  }
}

function peer(url: string, code: string, initialText: string): MarkdownCollabClient {
  return new MarkdownCollabClient({
    url,
    sessionCode: code,
    initialText,
    onRemoteTextChange: () => {},
    onStatusChange: () => {},
    onParticipantCountChange: () => {},
  });
}

describe('MarkdownWorkspace LAN/relay collaboration through the editor binding', () => {
  const originalWebSocket = globalThis.WebSocket;
  let peers: MarkdownCollabClient[];

  beforeAll(stubEditorLayout);

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    FakeWebSocket.hub = new FakeSocketHub();
    peers = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    for (const client of peers) client.destroy();
    vi.stubGlobal('WebSocket', originalWebSocket);
  });

  function create(realEngine: boolean) {
    TestBed.configureTestingModule({
      providers: realEngine ? [{ provide: CODE_EDITOR_ENGINE_LOADER, useValue: () => import('../../shared/components/code-editor/code-editor.engine') }] : [],
    });
    const fixture = TestBed.createComponent(MarkdownWorkspace);
    fixture.detectChanges();
    const workspace = fixture.componentInstance as unknown as Record<string, any>;
    const editor = () => fixture.debugElement.query(By.directive(CodeEditor)).componentInstance as CodeEditor;
    return { fixture, workspace, editor };
  }

  const join = (workspace: Record<string, any>, url: string, code: string) => {
    workspace['joinUrlInput'].set(url);
    workspace['joinCodeInput'].set(code);
    workspace['joinCollabSession']();
  };

  it('a joiner never seeds: it adopts the host document and the editor is bound to the shared text', async () => {
    const host = peer('ws://lan.test:1', 'abc', 'from host');
    peers.push(host);
    const { fixture, workspace, editor } = create(true);
    workspace['source'].set('my local draft');

    join(workspace, 'ws://lan.test:1', 'abc');
    await vi.waitFor(() => expect(workspace['collabBinding']()).not.toBeNull());
    await vi.waitFor(() => expect(workspace['source']()).toBe('from host'));
    fixture.detectChanges();

    const binding = workspace['collabBinding']();
    expect(binding.ytext.toString()).toBe('from host');
    expect(binding.awareness).toBeDefined();
    expect(editor().binding()).toBe(binding);
    await vi.waitFor(() => expect(editor().bound()).toBe(true));
    expect(editor().getText()).toBe('from host');
  });

  it('the host seeds the shared text from the source and binds the editor to it, over a relay', async () => {
    const { fixture, workspace, editor } = create(true);
    workspace['source'].set('# Seeded by the host');
    TestBed.inject(WorkspaceLayoutService).setPreferenceOverride(MARKDOWN_WORKSPACE_TOOL_ID, RELAY_URL_KEY, 'ws://relay.test');
    fixture.detectChanges();

    workspace['startHostingViaRelay']();
    const url = workspace['collabUrl']() as string;
    const code = workspace['collabSessionCode']() as string;
    peers.push(peer(url, code, ''));

    await vi.waitFor(() => expect(workspace['collabBinding']()).not.toBeNull());
    fixture.detectChanges();
    await vi.waitFor(() => expect(editor().bound()).toBe(true));

    expect(workspace['collabBinding']().ytext.toString()).toBe('# Seeded by the host');
    await vi.waitFor(() => expect(peers[0].getText()).toBe('# Seeded by the host'));
    expect(workspace['collabBinding']().user.name).toBe('Host');
  });

  it('local typing travels through the binding, and a remote edit leaves the local cursor on its text', async () => {
    const host = peer('ws://lan.test:2', 'abc', 'hello world');
    peers.push(host);
    const { fixture, workspace, editor } = create(true);
    join(workspace, 'ws://lan.test:2', 'abc');
    await vi.waitFor(() => expect(workspace['collabBinding']()).not.toBeNull());
    fixture.detectChanges();
    await vi.waitFor(() => expect(editor().bound()).toBe(true));
    await vi.waitFor(() => expect(editor().getText()).toBe('hello world'));

    editor().replaceRange(5, 5, ',');
    expect(workspace['source']()).toBe('hello, world');
    await vi.waitFor(() => expect(host.getText()).toBe('hello, world'));

    editor().setSelection(9, 9);
    host.applyLocalEdit('>> hello, world');
    await vi.waitFor(() => expect(workspace['source']()).toBe('>> hello, world'));
    expect(editor().getText()).toBe('>> hello, world');
    expect(editor().getSelection()).toEqual({ start: 12, end: 12 });
  });

  it('toolbar insertion, Clear and opened files all reach collaborators through the same binding', async () => {
    const host = peer('ws://lan.test:3', 'abc', 'text');
    peers.push(host);
    const { fixture, workspace, editor } = create(true);
    join(workspace, 'ws://lan.test:3', 'abc');
    await vi.waitFor(() => expect(workspace['collabBinding']()).not.toBeNull());
    fixture.detectChanges();
    await vi.waitFor(() => expect(editor().bound()).toBe(true));

    editor().setSelection(0, 4);
    workspace['insert']('bold');
    await vi.waitFor(() => expect(host.getText()).toBe('**text**'));

    workspace['onFileLoaded']('# from a file');
    await vi.waitFor(() => expect(host.getText()).toBe('# from a file'));
    await vi.waitFor(() => expect(editor().getText()).toBe('# from a file'));

    workspace['clear']();
    await vi.waitFor(() => expect(host.getText()).toBe(''));
    await vi.waitFor(() => expect(editor().getText()).toBe(''));
  });

  it('leaving the session returns the editor to the plain source', async () => {
    const host = peer('ws://lan.test:4', 'abc', 'shared text');
    peers.push(host);
    const { fixture, workspace, editor } = create(true);
    join(workspace, 'ws://lan.test:4', 'abc');
    await vi.waitFor(() => expect(workspace['collabBinding']()).not.toBeNull());
    fixture.detectChanges();
    await vi.waitFor(() => expect(editor().bound()).toBe(true));

    await workspace['stopCollabSession']();
    fixture.detectChanges();

    expect(workspace['collabBinding']()).toBeNull();
    expect(editor().bound()).toBe(false);
    await vi.waitFor(() => expect(editor().getText()).toBe('shared text'));
    editor().replaceRange(0, 0, 'my ');
    expect(workspace['source']()).toBe('my shared text');
    expect(host.getText()).toBe('shared text');
  });

  it('with the textarea fallback (engine unavailable) typing is diffed into the shared text', async () => {
    const host = peer('ws://lan.test:5', 'abc', 'abc');
    peers.push(host);
    const { fixture, workspace, editor } = create(false);
    join(workspace, 'ws://lan.test:5', 'abc');
    await vi.waitFor(() => expect(workspace['collabBinding']()).not.toBeNull());
    fixture.detectChanges();
    await vi.waitFor(() => expect(editor().engineState()).toBe('fallback'));
    expect(editor().bound()).toBe(false);

    const textarea = fixture.nativeElement.querySelector('app-code-editor textarea[data-code-editor-fallback]') as HTMLTextAreaElement;
    textarea.value = 'abcd';
    textarea.dispatchEvent(new Event('input'));

    await vi.waitFor(() => expect(host.getText()).toBe('abcd'));
  });
});
