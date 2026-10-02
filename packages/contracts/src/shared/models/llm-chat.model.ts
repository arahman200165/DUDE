export interface LlmChatMessage {
    readonly role: 'system' | 'user';
    readonly content: string;
}
