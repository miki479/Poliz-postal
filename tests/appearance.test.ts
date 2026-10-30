import { afterEach,expect,it } from 'vitest';
import { color,C,setThemeMode,themeMode,themedStyles,subscribeTheme } from '../mobile/src/constants/theme.ts';
afterEach(()=>setThemeMode('dark'));
it('ha due aspetti neutri e aggiorna anche gli stili dichiarati prima del cambio',()=>{
 setThemeMode('dark');
 const styles=themedStyles({card:{backgroundColor:color.surface,color:color.text},input:{color:C.text2}});
 expect(styles.card.backgroundColor).toBe('#191F25');
 setThemeMode('light');
 expect(themeMode()).toBe('light');expect(styles.card.backgroundColor).toBe('#FFFFFF');
 expect(styles.card.color).toBe('#171A20');expect(styles.input.color).toBe('#505B68');
 expect(color.accent).toBe('#5B3FE0');
 setThemeMode('dark');expect(styles.card.backgroundColor).toBe('#191F25');
});
it('notifica soltanto i cambiamenti reali e rimuove le sottoscrizioni',()=>{
 let n=0;const off=subscribeTheme(()=>n++);
 setThemeMode('dark');setThemeMode('light');setThemeMode('light');expect(n).toBe(1);
 off();setThemeMode('dark');expect(n).toBe(1);
});
