import type { AssistantAction } from '@/types/domain';
import { createChatStore, type ChatEntry as GenericChatEntry } from './createChatStore';

/** Chat entry for the infra Architecture Assistant. */
export type ChatEntry = GenericChatEntry<AssistantAction>;

/**
 * Ephemeral chat state for the infra Architecture Assistant drawer. Backed by the
 * shared chat-store factory (see [[createChatStore]]); the Agent Studio assistant
 * uses a sibling store so the two conversations stay separate.
 */
export const useAssistantStore = createChatStore<AssistantAction>();
