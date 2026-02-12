import { useCallback, useRef, useState, useEffect } from 'react';
import { Audio } from 'expo-av';

/* ---------- Types ---------- */

export type VoiceState = 'idle' | 'recording' | 'transcribing';

export interface VoiceRecorderResult {
  state: VoiceState;
  /** Current recording duration in seconds. */
  duration: number;
  /** Latest metering level (dB, typically -60..0). Updated ~4x/sec. */
  metering: number;
  /** Start recording. Returns false if permission denied. */
  start: () => Promise<boolean>;
  /** Stop recording, run transcription, return text or null on failure. */
  stopAndTranscribe: () => Promise<string | null>;
  /** Cancel recording / transcription, discard everything. */
  cancel: () => void;
}

/* ---------- Placeholder ASR ---------- */

/**
 * Replace this function with real ASR integration.
 * It receives the local file URI of the recorded audio.
 */
async function transcribeAudio(uri: string, durationSec: number): Promise<string> {
  // Simulate network latency
  await new Promise((r) => setTimeout(r, 1500));
  return `[语音转译占位] 录音时长 ${Math.round(durationSec)} 秒`;
}

/* ---------- Hook ---------- */

export function useVoiceRecorder(): VoiceRecorderResult {
  const [state, setState] = useState<VoiceState>('idle');
  const [duration, setDuration] = useState(0);
  const [metering, setMetering] = useState(-60);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  /* ---- Cleanup on unmount ---- */
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  /* ---- Start recording ---- */
  const start = useCallback(async (): Promise<boolean> => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) return false;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        },
        (status) => {
          // onRecordingStatusUpdate — provides metering
          if (status.isRecording && status.metering != null) {
            setMetering(status.metering);
          }
        },
        100, // update interval ms
      );

      recordingRef.current = recording;
      cancelledRef.current = false;
      startTimeRef.current = Date.now();
      setDuration(0);
      setMetering(-60);
      setState('recording');

      // Duration timer
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);

      return true;
    } catch {
      return false;
    }
  }, []);

  /* ---- Stop + transcribe ---- */
  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    if (!recordingRef.current) return null;

    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const finalDuration = (Date.now() - startTimeRef.current) / 1000;

    try {
      await recordingRef.current.stopAndUnloadAsync();
    } catch {
      // already stopped
    }

    const uri = recordingRef.current.getURI();
    recordingRef.current = null;

    if (!uri) {
      setState('idle');
      return null;
    }

    setState('transcribing');
    cancelledRef.current = false;

    try {
      const text = await transcribeAudio(uri, finalDuration);
      if (cancelledRef.current) return null;
      setState('idle');
      setDuration(0);
      setMetering(-60);
      return text;
    } catch {
      if (cancelledRef.current) return null;
      setState('idle');
      setDuration(0);
      setMetering(-60);
      return null;
    }
  }, []);

  /* ---- Cancel ---- */
  const cancel = useCallback(() => {
    cancelledRef.current = true;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (recordingRef.current) {
      recordingRef.current.stopAndUnloadAsync().catch(() => {});
      recordingRef.current = null;
    }

    setState('idle');
    setDuration(0);
    setMetering(-60);
  }, []);

  return { state, duration, metering, start, stopAndTranscribe, cancel };
}
