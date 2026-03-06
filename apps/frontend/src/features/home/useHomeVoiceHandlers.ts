import { useCallback } from 'react';
import { Alert } from 'react-native';

import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';

type Params = {
  voice: ReturnType<typeof useVoiceRecorder>;
  handleSend: (text: string) => Promise<void>;
  setToastMessage: (value: string | null) => void;
};

export function useHomeVoiceHandlers(params: Params) {
  const { voice, handleSend, setToastMessage } = params;

  const handleVoiceStart = useCallback(async () => {
    const ok = await voice.start();
    if (!ok) {
      Alert.alert('无法录音', '请在系统设置中允许 MoreThan 访问麦克风');
    }
  }, [voice]);

  const handleVoiceSend = useCallback(async () => {
    const text = await voice.stopAndTranscribe();
    if (text) {
      void handleSend(text);
    } else {
      setToastMessage('未能识别语音内容，请重试');
    }
  }, [handleSend, setToastMessage, voice]);

  const handleVoiceCancel = useCallback(() => {
    voice.cancel();
  }, [voice]);

  return {
    handleVoiceStart,
    handleVoiceSend,
    handleVoiceCancel,
  };
}
