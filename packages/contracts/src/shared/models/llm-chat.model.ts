export interface LlmChatMessage {
    readonly role: 'system' | 'user' | 'assistant';
    readonly content: string;
}

export interface LlmChatRequest {
    readonly messages: readonly LlmChatMessage[];
}

export type LlmChatResult = { readonly ok: true; readonly content: string } | { readonly ok: false; readonly error: string };
