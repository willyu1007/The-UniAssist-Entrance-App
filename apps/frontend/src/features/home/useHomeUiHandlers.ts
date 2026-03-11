import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import { makeId } from './helpers';
import type { BuilderDraftView, ChatItem, SwitchSuggestion, TaskThreadView } from './types';

type Params = {
  sessionId: string;
  setSessionId: (value: string) => void;
  setCursor: (value: number) => void;
  setItems: (items: ChatItem[]) => void;
  setTaskThreads: (next: Record<string, TaskThreadView>) => void;
  setActiveTask: (task: TaskThreadView | null) => void;
  setBuilderDrafts: Dispatch<SetStateAction<Record<string, BuilderDraftView>>>;
  setPendingReplyDraft: (draft: string | null) => void;
  setPendingTaskPickerVisible: (visible: boolean) => void;
  seenEventIds: MutableRefObject<Set<string>>;
  setSwitchSuggestion: (value: SwitchSuggestion | null) => void;
  setToastMessage: (value: string | null) => void;
};

export function useHomeUiHandlers(params: Params) {
  const {
    sessionId,
    setSessionId,
    setCursor,
    setItems,
    setTaskThreads,
    setActiveTask,
    setBuilderDrafts,
    setPendingReplyDraft,
    setPendingTaskPickerVisible,
    seenEventIds,
    setSwitchSuggestion,
    setToastMessage,
  } = params;

  const resetSession = useCallback((nextSessionId?: string) => {
    setSessionId(nextSessionId || makeId('session'));
    setCursor(0);
    setItems([]);
    setTaskThreads({});
    setActiveTask(null);
    setBuilderDrafts({});
    setPendingReplyDraft(null);
    setPendingTaskPickerVisible(false);
    seenEventIds.current.clear();
    setSwitchSuggestion(null);
  }, [
    seenEventIds,
    setActiveTask,
    setBuilderDrafts,
    setCursor,
    setItems,
    setPendingReplyDraft,
    setPendingTaskPickerVisible,
    setSessionId,
    setSwitchSuggestion,
    setTaskThreads,
  ]);

  const handleLogoPress = useCallback(() => {
    setToastMessage(`当前会话：${sessionId}`);
  }, [sessionId, setToastMessage]);

  return {
    resetSession,
    handleLogoPress,
  };
}
