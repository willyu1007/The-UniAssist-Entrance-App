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
  const isSample = /示例|样例|教学|评估|材料|课堂/.test(text);
  const isWork = /工作|任务|项目|会议|汇报|交付/.test(text);

  if (!isSample && !isWork) {
    appendTextItem('assistant', `未命中专项能力，先由通用助手处理：${text}`, 'builtin_chat · fallback', 'builtin_chat');
    return;
  }

  if (isSample) {
    const runId = makeId('run');
    const taskId = `task:${runId}`;
    const interaction: InteractionEvent = {
      type: 'provider_extension',
      extensionKind: 'task_question',
      payload: {
        schemaVersion: 'v0',
        providerId: 'sample',
        runId,
        taskId,
        questionId: `${taskId}:subject`,
        replyToken: makeId('reply'),
        prompt: '请告诉我要生成哪种样例评估对象。',
        answerSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', title: '评估对象' },
          },
          required: ['text'],
        },
        uiSchema: {
          order: ['text'],
        },
      },
    };
    appendInteractionItem(interaction, 'sample · local', 'sample', runId);
  }

  if (isWork) {
    appendTextItem('assistant', 'work 专项已接收任务，正在生成执行建议。', 'work · local', 'work', makeId('run'));
  }
}
