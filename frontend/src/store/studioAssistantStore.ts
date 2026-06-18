import type { AgentChatAction } from '@/types/agentflow';
import { createChatStore, type ChatEntry as GenericChatEntry } from './createChatStore';

/** Chat entry for the Agent Studio assistant. */
export type StudioChatEntry = GenericChatEntry<AgentChatAction>;

/**
 * Ephemeral chat state for the Agent Studio assistant drawer — the agentic-
 * workflow analog of [[assistantStore]]. Separate store so studio and infra
 * conversations never mix; both render through the shared ChatDrawer.
 */
export const useStudioAssistantStore = createChatStore<AgentChatAction>();
