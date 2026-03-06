import type { InteractionEvent } from '@baseinterface/contracts';

import { makeId } from './helpers';

type AppendTextItem = (
  role: 'user' | 'assistant' | 'system',
  text: string,
  label?: string,
  providerId?: string,
  runId?: string,
) => void;

type AppendInteractionItem = (
  interaction: InteractionEvent,
  label: string,
  providerId?: string,
  runId?: string,
) => void;

export function simulateLocalFlow(
  text: string,
  appendTextItem: AppendTextItem,
  appendInteractionItem: AppendInteractionItem,
): void {
  const isPlan = /计划|安排|日程|目标|规划/.test(text);
  const isWork = /工作|任务|项目|会议|汇报|交付/.test(text);

  if (!isPlan && !isWork) {
    appendTextItem('assistant', `未命中专项能力，先由通用助手处理：${text}`, 'builtin_chat · fallback', 'builtin_chat');
    return;
  }

  if (isPlan) {
    const runId = makeId('run');
    const taskId = `task:${runId}`;
    const interaction: InteractionEvent = {
      type: 'provider_extension',
      extensionKind: 'task_question',
      payload: {
        schemaVersion: 'v0',
        providerId: 'plan',
        runId,
        taskId,
        questionId: `${taskId}:goal`,
        replyToken: makeId('reply'),
        prompt: '请告诉我这次计划的核心目标。',
        answerSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', title: '任务目标' },
          },
          required: ['text'],
        },
        uiSchema: {
          order: ['text'],
        },
      },
    };
    appendInteractionItem(interaction, 'plan · local', 'plan', runId);
  }

  if (isWork) {
    appendTextItem('assistant', 'work 专项已接收任务，正在生成执行建议。', 'work · local', 'work', makeId('run'));
  }
}
