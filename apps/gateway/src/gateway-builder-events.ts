import type { Action, InteractionEvent } from '@baseinterface/contracts';
import type {
  WorkflowDraftFocusResponse,
  WorkflowDraftMutateResponse,
  WorkflowDraftPublishResponse,
  WorkflowDraftRecord,
  WorkflowDraftSessionLinkRecord,
} from '@baseinterface/workflow-contracts';
import { isWorkflowDraftTerminal } from '@baseinterface/workflow-contracts';
import { BUILDER_PROVIDER_ID } from './gateway-builder-client';

type BuilderResponse =
  | WorkflowDraftMutateResponse
  | WorkflowDraftFocusResponse
  | WorkflowDraftPublishResponse;

function draftStatusLabel(status: string): string {
  switch (status) {
    case 'created':
      return '已创建';
    case 'collecting_input':
      return '信息收集中';
    case 'synthesized':
      return '已合成';
    case 'editable':
      return '可编辑';
    case 'publishable':
      return '可发布';
    case 'published':
      return '已发布';
    default:
      return status;
  }
}

function buildDraftActionPayload(draft: WorkflowDraftRecord, isActive: boolean) {
  return {
    kind: 'builder_draft',
    draftId: draft.draftId,
    name: draft.name,
    workflowKey: draft.workflowKey,
    status: draft.status,
    publishable: draft.publishable,
    isActive,
  };
}

function buildPrimaryActions(draft: WorkflowDraftRecord, links: WorkflowDraftSessionLinkRecord[]): Action[] {
  const activeDraftId = links.find((link) => link.isActive)?.draftId;
  const isActive = activeDraftId === draft.draftId;
  const payload = buildDraftActionPayload(draft, isActive);
  if (isWorkflowDraftTerminal(draft.status)) {
    return [];
  }
  const actions: Action[] = [
    {
      actionId: `builder_synthesize:${draft.draftId}`,
      label: '合成',
      style: 'secondary',
      payload,
    },
    {
      actionId: `builder_validate:${draft.draftId}`,
      label: '校验',
      style: 'secondary',
      payload,
    },
  ];
  if (draft.publishable) {
    actions.push({
      actionId: `builder_publish:${draft.draftId}`,
      label: '发布',
      style: 'primary',
      payload,
    });
  }
  return actions;
}

function buildDraftSwitchCard(drafts: WorkflowDraftRecord[], links: WorkflowDraftSessionLinkRecord[]): InteractionEvent | undefined {
  if (drafts.length < 2) return undefined;
  const activeDraftId = links.find((link) => link.isActive)?.draftId;
  return {
    type: 'card',
    title: '切换 Builder 草稿',
    body: '当前会话关联了多条草稿，你可以切换焦点后继续操作。',
    actions: drafts.map((draft) => ({
      actionId: `builder_focus:${draft.draftId}`,
      label: `${draft.name || draft.workflowKey || draft.draftId.slice(0, 8)}${draft.draftId === activeDraftId ? ' · 当前' : ''}`,
      style: draft.draftId === activeDraftId ? 'primary' : 'secondary',
      payload: buildDraftActionPayload(draft, draft.draftId === activeDraftId),
    })),
  };
}

export function buildBuilderProjectionEvents(
  response: BuilderResponse,
  summaryText: string,
): InteractionEvent[] {
  const sessionLinks = response.sessionLinks || [];
  const sessionDrafts = response.sessionDrafts || [];
  const activeDraftId = sessionLinks.find((link) => link.isActive)?.draftId;
  const activeDraft = sessionDrafts.find((draft) => draft.draftId === activeDraftId) || response.draft;
  const events: InteractionEvent[] = [
    {
      type: 'assistant_message',
      text: summaryText,
    },
    {
      type: 'card',
      title: 'Builder 草稿',
      body: [
        `状态：${draftStatusLabel(activeDraft.status)}`,
        activeDraft.name ? `名称：${activeDraft.name}` : undefined,
        activeDraft.workflowKey ? `workflowKey：${activeDraft.workflowKey}` : undefined,
        activeDraft.publishable ? '最新校验：可发布' : '最新校验：未达到发布条件',
      ].filter(Boolean).join('\n'),
      actions: buildPrimaryActions(activeDraft, sessionLinks),
    },
  ];

  const switchCard = buildDraftSwitchCard(sessionDrafts, sessionLinks);
  if (switchCard) {
    events.push(switchCard);
  }

  if ('workflow' in response && 'version' in response) {
    events.push({
      type: 'assistant_message',
      text: `已发布到 ${response.workflow.workflowKey} v${response.version.version}。`,
    });
  }

  return events.map((event) => ({
    ...event,
    ...(event.type === 'card' ? {
      actions: event.actions?.map((action) => ({
        ...action,
        payload: {
          providerId: BUILDER_PROVIDER_ID,
          ...(action.payload || {}),
        },
      })),
    } : {}),
  })) as InteractionEvent[];
}
