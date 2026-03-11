import type { InteractionEvent } from '@baseinterface/contracts';
import type { WorkflowFormalEvent } from '@baseinterface/workflow-contracts';

export function translateWorkflowFormalEvents(
  compatProviderId: string,
  runId: string,
  events: WorkflowFormalEvent[],
): InteractionEvent[] {
  const translated: InteractionEvent[] = [];

  for (const event of events) {
    if (event.kind === 'compat_interaction') {
      translated.push(event.payload.interaction);
      continue;
    }

    if (event.kind === 'waiting_input') {
      translated.push({
        type: 'provider_extension',
        extensionKind: 'task_question',
        payload: {
          schemaVersion: 'v0',
          providerId: compatProviderId,
          runId,
          taskId: event.payload.taskId,
          questionId: event.payload.questionId,
          replyToken: event.payload.replyToken,
          prompt: event.payload.prompt,
          answerSchema: event.payload.answerSchema,
          uiSchema: event.payload.uiSchema,
          metadata: {
            ...(event.payload.metadata || {}),
            origin: 'workflow',
            nodeRunId: event.payload.nodeRunId,
            nodeKey: event.payload.nodeKey,
          },
        },
      });
      continue;
    }

    if (event.kind === 'node_state' && event.payload.compatTaskState) {
      translated.push({
        type: 'provider_extension',
        extensionKind: 'task_state',
        payload: {
          schemaVersion: 'v0',
          providerId: compatProviderId,
          runId,
          taskId: event.payload.taskId || event.payload.nodeRunId,
          state: event.payload.compatTaskState,
          executionPolicy: event.payload.executionPolicy || 'require_user_confirm',
          metadata: {
            ...(event.payload.metadata || {}),
            origin: 'workflow',
            nodeRunId: event.payload.nodeRunId,
            nodeKey: event.payload.nodeKey,
            workflowNodeStatus: event.payload.status,
          },
        },
      });
      continue;
    }

    if (event.kind === 'approval_requested') {
      translated.push({
        type: 'card',
        title: '等待审批',
        body: event.payload.prompt,
        actions: [
          {
            actionId: `approve_request:${event.payload.approvalRequestId}`,
            label: '通过',
            style: 'primary',
          },
          {
            actionId: `reject_request:${event.payload.approvalRequestId}`,
            label: '拒绝',
            style: 'danger',
          },
        ],
      });
      continue;
    }

    if (event.kind === 'approval_decided') {
      translated.push({
        type: 'assistant_message',
        text: event.payload.decision === 'approved' ? '审批已通过。' : '审批已拒绝。',
      });
      continue;
    }

    if (event.kind === 'artifact_created') {
      translated.push({
        type: 'assistant_message',
        text: `已生成结构化产物 ${event.payload.artifactType}（${event.payload.state}）。`,
      });
    }
  }

  return translated;
}
