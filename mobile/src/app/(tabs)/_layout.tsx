import { NativeTabs } from 'expo-router/native-tabs';

import { color } from '@/constants/theme';

/**
 * Un'unica barra di navigazione, quella di sistema: rispetta safe area e Dynamic Type, resta leggibile
 * (su iOS recente il materiale è gestito dal sistema) e non si nasconde durante lo scroll.
 * Selezione: icona piena + etichetta in turchese, quindi mai affidata al solo colore.
 */
export default function TabsLayout() {
  return (
    <NativeTabs tintColor={color.accent} labelStyle={{ default: { color: color.textSecondary }, selected: { color: color.accent } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="esplora">
        <NativeTabs.Trigger.Label>Esplora</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} md="explore" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="club">
        <NativeTabs.Trigger.Label>Club</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.3', selected: 'person.3.fill' }} md="groups" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="social">
        <NativeTabs.Trigger.Label>Social</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} md="forum" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profilo">
        <NativeTabs.Trigger.Label>Profilo</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
