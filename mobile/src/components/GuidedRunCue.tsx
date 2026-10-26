import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { Button, Panel, t } from '@/components/ui';
import { color, S } from '@/constants/theme';
import { fmtClock } from '@/lib/format';
import { guidedStep } from '@shared/beginnerRunning.ts';
import type { Segment } from '@shared/types.ts';
export function GuidedRunCue({ segments, elapsedSec, paused, compact=false }: { segments: Segment[]; elapsedSec: number; paused: boolean;compact?:boolean }) {
  const [voice, setVoice] = useState(false);
  const last = useRef(-1);
  const step = guidedStep(segments, elapsedSec);
  const label = step.done ? 'Allenamento guidato concluso' : (step.segment?.label ?? '');
  useEffect(() => {
    if (paused) {
      void Speech.stop();
      return;
    }
    if (step.index === last.current) return;
    last.current = step.index;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (voice) Speech.speak(label, { language: 'it-IT', rate: 0.95 });
  }, [step.index, label, paused, voice]);
  useEffect(
    () => () => {
      void Speech.stop();
    },
    [],
  );
  return (
    <Panel style={{ padding: S.md, gap: S.xs }}>
      <Text style={[t.title, { color: color.brandText }]}>{label}</Text>
      <Text style={t.body}>
        {step.done
          ? 'Puoi terminare e salvare quando vuoi.'
          : `${fmtClock(step.remainingSec)} · fase ${step.index + 1} di ${step.total}${paused ? ' · in pausa' : ''}`}
      </Text>
      {step.next ? (
        <Text style={t.small}>
          Poi: {step.next.label}, {fmtClock(step.next.durationSec)}
        </Text>
      ) : null}
      <Button
        small
        title={voice ? 'Disattiva voce guida' : 'Attiva voce guida'}
        onPress={() => {
          if (voice) void Speech.stop();
          else if (!paused) Speech.speak(label, { language: 'it-IT' });
          setVoice(!voice);
        }}
      />
      {!compact?<Text style={t.small}>Voce facoltativa; con iPhone in silenzioso potrebbe non sentirsi.</Text>:null}
    </Panel>
  );
}
