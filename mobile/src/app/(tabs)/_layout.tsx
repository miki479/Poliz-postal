import { Tabs } from 'expo-router';
import { RecordTabBar } from '@/components/RecordTabBar';

export default function TabsLayout() {
  return <Tabs screenOptions={{headerShown:false,tabBarHideOnKeyboard:true}} tabBar={props=><RecordTabBar {...props}/>}>
    <Tabs.Screen name="index" options={{title:'Home'}}/>
    <Tabs.Screen name="esplora" options={{title:'Esplora'}}/>
    <Tabs.Screen name="club" options={{title:'Gruppi',href:null}}/>
    <Tabs.Screen name="medaglie" options={{title:'Medaglie'}}/>
    <Tabs.Screen name="profilo" options={{title:'Profilo'}}/>
    <Tabs.Screen name="social" options={{href:null}}/>
  </Tabs>;
}
