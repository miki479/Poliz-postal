import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { createElement, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Button, Sheet, t } from './ui';
import { color, HIT, R, S, themeMode, type } from '@/constants/theme';
import { mergeDatePart, type DatePart } from '@/lib/dateParts';

export function DateField({label,value,onChange,mode='datetime'}:{label:string;value:Date;onChange(d:Date):void;mode?:DatePart|'datetime'}) {
 const [open,setOpen]=useState<DatePart|null>(null),[draft,setDraft]=useState(value);
 const parts:DatePart[]=mode==='datetime'?['date','time']:[mode];
 const date=value.toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'});
 const time=value.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
 const pad=(n:number)=>String(n).padStart(2,'0');
 return <View style={{gap:S.sm}}>
  <Text style={t.small}>{label}</Text>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:S.sm}}>
   {parts.map(part=><Pressable key={part} accessibilityRole="button" accessibilityLabel={`${part==='date'?'Data':'Ora'}: ${part==='date'?date:time}`} onPress={()=>{setDraft(new Date(value));setOpen(part);}} style={({pressed})=>({flexGrow:1,flexBasis:part==='date'?160:100,minHeight:HIT,padding:S.md,borderRadius:R.pill,backgroundColor:pressed?color.surfacePressed:color.surfaceElevated,flexDirection:'row',alignItems:'center',gap:S.sm})}>
    <Ionicons name={part==='date'?'calendar-outline':'time-outline'} size={18} color={color.textSecondary}/>
    <Text style={[type.body,{color:color.text,fontWeight:'600',flexShrink:1}]}>{part==='date'?date:time}</Text>
   </Pressable>)}
  </View>
  {Platform.OS==='android'&&open?<DateTimePicker value={value} mode={open} is24Hour onChange={(event,chosen)=>{const part=open;setOpen(null);if(event.type==='set'&&chosen)onChange(mergeDatePart(value,part,chosen));}}/>:null}
  {Platform.OS!=='android'?<Sheet visible={!!open} title={open==='time'?'Scegli l’ora':'Scegli il giorno'} onClose={()=>setOpen(null)} footer={<Button title="Fatto" onPress={()=>{if(open)onChange(mergeDatePart(value,open,draft));setOpen(null);}}/>}>
   {open&&Platform.OS==='web'?createElement('input',{type:open,value:open==='date'?`${draft.getFullYear()}-${pad(draft.getMonth()+1)}-${pad(draft.getDate())}`:`${pad(draft.getHours())}:${pad(draft.getMinutes())}`,'aria-label':open==='date'?'Giorno':'Orario',style:{minHeight:52,fontSize:20,padding:12,borderRadius:12,background:color.surface,color:color.text,border:`1px solid ${color.controlBorder}`,colorScheme:themeMode()},onChange:(event:{target:{value:string}})=>{if(!event.target.value)return;const n=new Date(draft);const fields=event.target.value.split(open==='date'?'-':':').map(Number);if(fields.some(v=>!Number.isFinite(v)))return;if(open==='date')n.setFullYear(fields[0],fields[1]-1,fields[2]);else n.setHours(fields[0],fields[1],0,0);setDraft(n);}}):open?<DateTimePicker value={draft} mode={open} display={open==='date'?'inline':'spinner'} themeVariant={themeMode()} locale="it-IT" accentColor={color.accent} onChange={(_,chosen)=>{if(chosen)setDraft(chosen);}}/>:null}
  </Sheet>:null}
 </View>;
}
