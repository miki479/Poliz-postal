import { Pressable, Text, View } from 'react-native';

import { ActivityGlyph } from '@/components/SportIcon';
import { styleOfSport } from '@/constants/activityColors';
import { color, HIT, R, S, type } from '@/constants/theme';
import { SPORTS_ENABLED } from '@/lib/format';
import type { SportId } from '@shared/types.ts';

type Props = { label: string; options?: Array<{ id: SportId; label: string }> } & ({ multi?: false; value: SportId; onChange: (v: SportId) => void } | { multi: true; value: SportId[]; onChange: (v: SportId[]) => void });

/**
 * Scelta del tipo di attività (Corsa, Camminata, Trail, Corsa + camminata, Altro) con la figura e il colore ufficiale di
 * ciascuno. Ogni voce ha sempre la stessa larghezza, scelta o no (cambiano solo bordo, fondo e colore): con cinque voci
 * la fila va a capo in modo stabile e toccare una voce non sposta le altre.
 */
export function SportChips(props: Props) {
  const { label, options = SPORTS_ENABLED } = props;
  const isOn = (id: SportId) => (props.multi ? props.value.includes(id) : props.value === id);
  const toggle = (id: SportId) => {
    if (!props.multi) return props.onChange(id);
    props.onChange(props.value.includes(id) ? props.value.filter((x) => x !== id) : [...props.value, id]);
  };
  return (
    <View style={{ gap: S.sm }}>
      <Text style={[type.headline, { color: color.text }]} nativeID={`sport-${label}`}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }} accessibilityRole={props.multi ? undefined : 'radiogroup'} accessibilityLabel={label}>
        {options.map((o) => {
          const on = isOn(o.id);
          const st = styleOfSport(o.id);
          return (
            <Pressable
              key={o.id}
              onPress={() => toggle(o.id)}
              accessibilityRole={props.multi ? 'checkbox' : 'radio'}
              accessibilityState={props.multi ? { checked: on } : { selected: on }}
              accessibilityLabel={o.label}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                minHeight: HIT,
                maxWidth: '100%',
                flexShrink: 1,
                paddingVertical: S.sm,
                paddingHorizontal: S.md,
                borderRadius: R.pill,
                borderWidth: 1.5,
                borderColor: on ? st.solid : color.controlBorder,
                backgroundColor: on ? st.tint : pressed ? color.surfacePressed : 'transparent',
              })}>
              <ActivityGlyph style={st} size={18} color={on ? st.solid : color.textSecondary} />
              <Text style={[type.subhead, { flexShrink: 1, color: on ? color.text : color.textSecondary, fontWeight: '600' }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
