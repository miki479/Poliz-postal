'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Database,
  FileJson,
  Gauge,
  History,
  Package,
  Pause,
  Pencil,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  buildReport,
  createRecord,
  formatDate,
  formatMonth,
  formatNumber,
  isFriday,
  isWeekend,
  localDateInput,
  localMonthInput,
  PRODUCTS,
  recordIsValid,
  shiftHours,
  shiftUnits,
  teamForSlot,
  TEAMS,
  type ProductionRecord,
  type ShiftEntry,
  type ShiftSlot,
  type TeamId,
} from '@/lib/production';

type Tab = 'today' | 'history' | 'report';

const STORAGE_KEY = 'turno-reale-records-v1';

function currentGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buongiorno';
  if (hour < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}

function cloneRecord(record: ProductionRecord) {
  return JSON.parse(JSON.stringify(record)) as ProductionRecord;
}

function emptyStatus(month: string) {
  return `Nessuna giornata a confronto in ${formatMonth(month)}.`;
}

export function ProductionApp() {
  const [records, setRecords] = useState<ProductionRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<Tab>('today');
  const [month, setMonth] = useState(localMonthInput());
  const [formOpen, setFormOpen] = useState(false);
  const [editor, setEditor] = useState<ProductionRecord>(() => createRecord());
  const [backupOpen, setBackupOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let savedRecords: ProductionRecord[] | null = null;
    let loadError = false;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) savedRecords = parsed.filter(recordIsValid);
      }
    } catch {
      loadError = true;
    }
    queueMicrotask(() => {
      if (savedRecords) setRecords(savedRecords);
      if (loadError) setNotice('Il salvataggio locale non era leggibile. Importa un backup se ne hai uno.');
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }, [records, hydrated]);

  const report = useMemo(() => buildReport(records, month), [records, month]);
  const currentReport = useMemo(() => buildReport(records, localMonthInput()), [records]);
  const sortedRecords = useMemo(() => [...records].sort((a, b) => b.date.localeCompare(a.date)), [records]);
  const lastRecord = sortedRecords[0];

  function openNewRecord() {
    setEditor(createRecord());
    setFormOpen(true);
  }

  function openEditRecord(record: ProductionRecord) {
    setEditor(cloneRecord(record));
    setFormOpen(true);
  }

  function saveRecord() {
    const clean = cloneRecord(editor);
    for (const slot of ['morning', 'afternoon'] as const) {
      for (const key of ['steel25', 'plastic20', 'bib10'] as const) {
        clean[slot][key] = Math.max(0, Math.round(Number(clean[slot][key]) || 0));
      }
      clean[slot].staffCount = Math.min(8, Math.max(1, Math.round(Number(clean[slot].staffCount) || 4)));
    }
    if (!clean.isSingleShift && shiftUnits(clean.morning) + shiftUnits(clean.afternoon) === 0) {
      setNotice('Inserisci almeno una quantità prima di salvare.');
      window.setTimeout(() => setNotice(null), 3200);
      return;
    }
    clean.updatedAt = new Date().toISOString();
    setRecords((current) => {
      const sameDate = current.find((item) => item.date === clean.date && item.id !== clean.id);
      const withoutCurrent = current.filter((item) => item.id !== clean.id && item.id !== sameDate?.id);
      return [...withoutCurrent, clean];
    });
    setFormOpen(false);
    setNotice(clean.isSingleShift ? 'Turno unico segnato: non entrerà nei confronti.' : 'Giornata salvata e inclusa nel report.');
    window.setTimeout(() => setNotice(null), 3800);
  }

  function deleteRecord(id: string) {
    setRecords((current) => current.filter((record) => record.id !== id));
    setNotice('Giornata eliminata.');
    window.setTimeout(() => setNotice(null), 3000);
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify({ app: 'Turno Reale', version: 1, exportedAt: new Date().toISOString(), records }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `turno-reale-backup-${localDateInput()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('Backup scaricato. Conservalo in File o iCloud.');
  }

  function exportCsv() {
    const header = ['Data', 'Turno', 'Squadra', 'Acciaio 25L', 'Plastica 20L', 'Bag 10L', 'Totale pezzi', 'Ore nette', 'Pausa 30m', 'Addetti', 'Confrontabile'];
    const rows = report.relevant.flatMap((record) => (['morning', 'afternoon'] as const).map((slot) => {
      const shift = record[slot];
      return [
        record.date,
        slot === 'morning' ? 'Mattina' : 'Pomeriggio',
        TEAMS[teamForSlot(record, slot)].name,
        shift.steel25,
        shift.plastic20,
        shift.bib10,
        shiftUnits(shift),
        shiftHours(slot, record.date, shift.pauseTaken).toFixed(2).replace('.', ','),
        shift.pauseTaken ? 'Sì' : 'No',
        shift.staffCount,
        record.isSingleShift ? 'No' : 'Sì',
      ];
    }));
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `turno-reale-${month}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function shareReport() {
    if (!report.compared.length) {
      setNotice(emptyStatus(month));
      return;
    }
    const ms = report.teams.ms;
    const ga = report.teams.ga;
    const winnerLine = report.winner
      ? `${TEAMS[report.winner].name}: +${formatNumber(report.advantage, 1)}% nelle uscite per ora.`
      : 'Uscite per ora in parità.';
    const text = [
      `Turno Reale · ${formatMonth(month)}`,
      `${report.compared.length} giornate confrontate`,
      `M&S: ${formatNumber(ms.units)} pezzi · ${formatNumber(ms.rate, 1)} pz/h`,
      `G&A: ${formatNumber(ga.units)} pezzi · ${formatNumber(ga.rate, 1)} pz/h`,
      winnerLine,
      `Turni unici esclusi: ${report.excluded}`,
    ].join('\n');
    try {
      if (navigator.share) await navigator.share({ title: `Turno Reale · ${formatMonth(month)}`, text });
      else {
        await navigator.clipboard.writeText(text);
        setNotice('Riepilogo copiato.');
      }
    } catch {
      // The user may simply close the iOS share sheet.
    }
  }

  async function importBackup(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      const items = Array.isArray(parsed) ? parsed : parsed.records;
      if (!Array.isArray(items)) throw new Error('invalid');
      const valid = items.filter(recordIsValid);
      if (!valid.length && items.length) throw new Error('invalid');
      setRecords(valid);
      setBackupOpen(false);
      setNotice(`${valid.length} giornate ripristinate dal backup.`);
    } catch {
      setNotice('Questo file non è un backup valido di Turno Reale.');
    }
  }

  return (
    <main className="min-h-dvh bg-background pb-28 text-foreground">
      {notice && (
        <output className="fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[80] mx-auto flex max-w-sm items-start gap-3 rounded-2xl border border-white/70 bg-slate-950/92 px-4 py-3 text-sm text-white shadow-2xl backdrop-blur-xl">
          <Check className="mt-0.5 size-4 shrink-0 text-cyan-300" />
          <span className="min-w-0 flex-1 leading-5">{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Chiudi messaggio"><X className="size-4 text-white/60" /></button>
        </output>
      )}

      {tab === 'today' && (
        <TodayView
          report={currentReport}
          lastRecord={lastRecord}
          onNew={openNewRecord}
          onOpenReport={() => { setMonth(localMonthInput()); setTab('report'); }}
          onBackup={() => setBackupOpen(true)}
        />
      )}
      {tab === 'history' && (
        <HistoryView records={sortedRecords} onEdit={openEditRecord} onDelete={deleteRecord} onNew={openNewRecord} />
      )}
      {tab === 'report' && (
        <ReportView report={report} month={month} onMonth={setMonth} onCsv={exportCsv} onShare={shareReport} onBackup={() => setBackupOpen(true)} />
      )}

      <BottomNav tab={tab} onTab={setTab} />
      <RecordDrawer open={formOpen} onOpenChange={setFormOpen} value={editor} onChange={setEditor} onSave={saveRecord} />

      <Drawer open={backupOpen} onOpenChange={setBackupOpen} showSwipeHandle>
        <DrawerContent className="mx-auto max-w-md rounded-t-[28px] bg-background">
          <DrawerHeader className="px-5 pt-6 text-left">
            <DrawerTitle className="text-xl font-semibold tracking-[-0.03em]">I tuoi dati</DrawerTitle>
            <DrawerDescription className="text-left leading-5">Restano su questo iPhone. Fai ogni tanto un backup su File o iCloud.</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-3 px-5 py-5">
            <button onClick={downloadBackup} className="surface-card flex w-full items-center gap-4 rounded-2xl p-4 text-left">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ArrowDownToLine className="size-5" /></span>
              <span><span className="block font-semibold">Scarica backup</span><span className="mt-0.5 block text-xs text-muted-foreground">{records.length} giornate · formato JSON</span></span>
            </button>
            <button onClick={() => importRef.current?.click()} className="surface-card flex w-full items-center gap-4 rounded-2xl p-4 text-left">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-700"><FileJson className="size-5" /></span>
              <span><span className="block font-semibold">Ripristina backup</span><span className="mt-0.5 block text-xs text-muted-foreground">Sostituisce i dati presenti sul dispositivo</span></span>
            </button>
            <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBackup(file);
              event.target.value = '';
            }} />
          </div>
          <DrawerFooter className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <Button variant="outline" className="h-12 rounded-2xl" onClick={() => setBackupOpen(false)}>Chiudi</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </main>
  );
}

function TodayView({ report, lastRecord, onNew, onOpenReport, onBackup }: {
  report: ReturnType<typeof buildReport>;
  lastRecord?: ProductionRecord;
  onNew: () => void;
  onOpenReport: () => void;
  onBackup: () => void;
}) {
  const winner = report.winner;
  return (
    <>
      <header className="app-header px-5 pb-7 pt-[max(1.5rem,env(safe-area-inset-top))] text-white">
        <div className="mx-auto max-w-md">
          <div className="mb-7 flex items-center justify-between">
            <div>
              <p className="eyebrow text-white/60">{formatDate(localDateInput()).toLocaleUpperCase('it-IT')}</p>
              <h1 className="mt-1 text-[30px] font-semibold tracking-[-0.045em]">{currentGreeting()}, Michele</h1>
            </div>
            <button onClick={onBackup} className="flex size-11 items-center justify-center rounded-2xl bg-white/12 ring-1 ring-white/15 backdrop-blur-xl" aria-label="Backup dati">
              <Database className="size-5" />
            </button>
          </div>

          <button onClick={onOpenReport} className="glass-panel w-full rounded-[28px] p-5 text-left">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium text-white/65">Questo mese · {report.compared.length} giornate</p>
                <p className="mt-1 text-[25px] font-semibold tracking-[-0.04em]">{winner ? TEAMS[winner].name : report.compared.length ? 'Situazione in parità' : 'Pronto al primo confronto'}</p>
              </div>
              <BarChart3 className="size-5 shrink-0 text-cyan-200" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/10 px-4 py-3">
                <p className="text-xs text-white/55">Fusti + bag</p>
                <p className="mt-1 text-xl font-semibold">{formatNumber(report.teams.ms.units + report.teams.ga.units)} pz</p>
              </div>
              <div className="rounded-2xl bg-cyan-300/15 px-4 py-3 ring-1 ring-cyan-200/15">
                <p className="text-xs text-cyan-100/65">Vantaggio reale</p>
                <p className="mt-1 text-xl font-semibold text-cyan-100">{winner ? `+${formatNumber(report.advantage, 1)}%` : '—'}</p>
              </div>
            </div>
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-5 pt-6">
        <section className="surface-card rounded-[24px] p-5">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Sparkles className="size-5" /></div>
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Registra i due turni</h2>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">Tu inserisci solo fusti e bag. Ore, venerdì e confronto li calcola l’app.</p>
            </div>
          </div>
          <Button onClick={onNew} className="mt-5 h-13 w-full rounded-2xl bg-primary text-[15px] font-semibold shadow-[0_10px_26px_-10px_var(--primary)]" size="lg">
            <Plus className="size-5" /> Nuova giornata
          </Button>
        </section>

        {lastRecord ? <LastDayCard record={lastRecord} /> : (
          <section className="surface-card rounded-[24px] border-dashed p-5 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><CalendarDays className="size-5" /></div>
            <h2 className="mt-3 font-semibold">Ancora nessuna giornata</h2>
            <p className="mx-auto mt-1 max-w-xs text-sm leading-5 text-muted-foreground">Alla fine del secondo turno bastano meno di 30 secondi per avere numeri verificabili.</p>
          </section>
        )}

        <div className="flex items-start gap-3 rounded-2xl bg-primary/7 px-4 py-3 text-xs leading-5 text-muted-foreground">
          <Gauge className="mt-0.5 size-4 shrink-0 text-primary" />
          Il confronto usa fusti + bag per ora netta. I turni unici restano nello storico, ma valgono zero nel confronto.
        </div>
      </div>
    </>
  );
}

function LastDayCard({ record }: { record: ProductionRecord }) {
  if (record.isSingleShift) {
    return (
      <section className="surface-card rounded-[24px] p-5">
        <div className="flex items-center justify-between">
          <div><p className="eyebrow text-muted-foreground">ULTIMA GIORNATA</p><p className="mt-1 font-semibold capitalize">{formatDate(record.date)}</p></div>
          <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-semibold text-muted-foreground">Turno unico</span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Segnata correttamente come non confrontabile.</p>
      </section>
    );
  }
  const morningRate = shiftUnits(record.morning) / shiftHours('morning', record.date, record.morning.pauseTaken);
  const afternoonRate = shiftUnits(record.afternoon) / shiftHours('afternoon', record.date, record.afternoon.pauseTaken);
  const morningWon = morningRate > afternoonRate;
  const winner = morningWon ? record.morningTeam : record.morningTeam === 'ms' ? 'ga' : 'ms';
  const loserRate = morningWon ? afternoonRate : morningRate;
  const advantage = loserRate > 0 ? ((Math.max(morningRate, afternoonRate) / loserRate) - 1) * 100 : 0;
  return (
    <section className="surface-card rounded-[24px] p-5">
      <div className="flex items-center justify-between">
        <div><p className="eyebrow text-muted-foreground">ULTIMA GIORNATA</p><p className="mt-1 font-semibold capitalize">{formatDate(record.date)}</p></div>
        <CalendarDays className="size-5 text-muted-foreground" />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(12, Math.min(88, 50 + advantage / 2))}%` }} /></div>
        <span className="text-sm font-semibold text-primary">{TEAMS[winner].short} +{formatNumber(advantage, 1)}%</span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Risultato corretto per le ore nette dei due turni.</p>
    </section>
  );
}

function HistoryView({ records, onEdit, onDelete, onNew }: {
  records: ProductionRecord[];
  onEdit: (record: ProductionRecord) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="mx-auto max-w-md px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="flex items-end justify-between">
        <div><p className="eyebrow text-primary">ARCHIVIO</p><h1 className="mt-1 text-[30px] font-semibold tracking-[-0.045em]">Storico</h1><p className="mt-1 text-sm text-muted-foreground">{records.length} giornate salvate</p></div>
        <Button onClick={onNew} size="icon-lg" className="size-12 rounded-2xl"><Plus className="size-5" /></Button>
      </div>

      {records.length ? (
        <div className="mt-6 space-y-3">
          {records.map((record) => <HistoryCard key={record.id} record={record} onEdit={() => onEdit(record)} onDelete={() => onDelete(record.id)} />)}
        </div>
      ) : (
        <div className="surface-card mt-8 rounded-[24px] p-7 text-center">
          <History className="mx-auto size-7 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">Lo storico è vuoto</h2>
          <p className="mt-1 text-sm text-muted-foreground">Le giornate compariranno qui in ordine di data.</p>
        </div>
      )}
    </div>
  );
}

function HistoryCard({ record, onEdit, onDelete }: { record: ProductionRecord; onEdit: () => void; onDelete: () => void }) {
  if (record.isSingleShift) {
    return (
      <article className="surface-card rounded-[22px] p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><CalendarDays className="size-5" /></div>
          <div className="min-w-0 flex-1"><h2 className="font-semibold capitalize">{formatDate(record.date)}</h2><p className="mt-0.5 text-xs text-muted-foreground">Turno unico · escluso</p></div>
          <IconActions onEdit={onEdit} onDelete={onDelete} />
        </div>
      </article>
    );
  }
  const rates = (['morning', 'afternoon'] as const).map((slot) => ({
    team: teamForSlot(record, slot),
    rate: shiftUnits(record[slot]) / shiftHours(slot, record.date, record[slot].pauseTaken),
    units: shiftUnits(record[slot]),
  }));
  const top = rates[0].rate >= rates[1].rate ? rates[0] : rates[1];
  return (
    <article className="surface-card rounded-[22px] p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Package className="size-5" /></div>
        <div className="min-w-0 flex-1"><h2 className="font-semibold capitalize">{formatDate(record.date)}</h2><p className="mt-0.5 text-xs text-muted-foreground">{isFriday(record.date) ? 'Venerdì corto · ' : ''}{TEAMS[top.team].short} davanti</p></div>
        <IconActions onEdit={onEdit} onDelete={onDelete} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {rates.map((item) => (
          <div key={item.team} className={`rounded-2xl px-3 py-2.5 ${item.team === top.team ? 'bg-primary/8' : 'bg-muted/70'}`}>
            <div className="flex items-center justify-between"><span className="text-xs font-semibold">{TEAMS[item.team].short}</span><span className="text-[10px] text-muted-foreground">{item.units} pz</span></div>
            <p className="mt-1 text-lg font-semibold tracking-[-0.03em]">{formatNumber(item.rate, 1)} <span className="text-[10px] font-medium text-muted-foreground">pz/h</span></p>
          </div>
        ))}
      </div>
    </article>
  );
}

function IconActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-1">
      <button onClick={onEdit} className="flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted" aria-label="Modifica"><Pencil className="size-4" /></button>
      <button onClick={() => { if (window.confirm('Eliminare questa giornata?')) onDelete(); }} className="flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Elimina"><Trash2 className="size-4" /></button>
    </div>
  );
}

function ReportView({ report, month, onMonth, onCsv, onShare, onBackup }: {
  report: ReturnType<typeof buildReport>;
  month: string;
  onMonth: (month: string) => void;
  onCsv: () => void;
  onShare: () => Promise<void>;
  onBackup: () => void;
}) {
  const maxRate = Math.max(report.teams.ms.rate, report.teams.ga.rate, 1);
  return (
    <div className="mx-auto max-w-md px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="flex items-start justify-between gap-4">
        <div><p className="eyebrow text-primary">NUMERI REALI</p><h1 className="mt-1 text-[30px] font-semibold tracking-[-0.045em]">Report</h1><p className="mt-1 text-sm text-muted-foreground">Confronto mensile corretto per ore nette</p></div>
        <button onClick={onBackup} className="flex size-11 items-center justify-center rounded-2xl bg-card text-muted-foreground shadow-sm" aria-label="Backup dati"><Database className="size-5" /></button>
      </div>

      <label className="surface-card mt-6 flex items-center gap-3 rounded-2xl px-4 py-3">
        <CalendarDays className="size-5 text-primary" />
        <span className="min-w-0 flex-1 text-sm font-semibold capitalize">{formatMonth(month)}</span>
        <input type="month" value={month} onChange={(event) => onMonth(event.target.value)} className="month-input w-8 opacity-0" aria-label="Scegli mese" />
        <ChevronDown className="size-4 text-muted-foreground" />
      </label>

      {!report.compared.length ? (
        <div className="surface-card mt-4 rounded-[24px] p-7 text-center">
          <BarChart3 className="mx-auto size-7 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">Niente da confrontare</h2>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{emptyStatus(month)} I turni unici sono volutamente ignorati.</p>
        </div>
      ) : (
        <>
          <section className="report-hero mt-4 rounded-[26px] p-5 text-white">
            <p className="text-xs font-medium text-white/60">RISULTATO DEL MESE</p>
            <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.04em]">{report.winner ? `${TEAMS[report.winner].name} davanti` : 'Perfetta parità'}</h2>
            <p className="mt-1 text-sm text-white/70">{report.winner ? `+${formatNumber(report.advantage, 1)}% nei fusti + bag per ora` : 'Stesse uscite medie per ora netta'}</p>
            <div className="mt-5 flex gap-2 text-xs">
              <span className="rounded-full bg-white/10 px-3 py-1.5">{report.compared.length} giornate valide</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5">{report.excluded} escluse</span>
            </div>
          </section>

          <section className="surface-card mt-4 rounded-[24px] p-5">
            <div className="flex items-center gap-2"><Gauge className="size-4 text-primary" /><h2 className="font-semibold">Fusti + bag per ora netta</h2></div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Normalizza il mattino più lungo, il pomeriggio più corto, il venerdì e le pause.</p>
            <div className="mt-5 space-y-4">
              {(['ms', 'ga'] as TeamId[]).map((team) => {
                const item = report.teams[team];
                return (
                  <div key={team}>
                    <div className="mb-2 flex items-end justify-between"><span className="text-sm font-semibold">{TEAMS[team].short}</span><span className="text-xl font-semibold tracking-[-0.03em]">{formatNumber(item.rate, 1)} <small className="text-xs font-medium text-muted-foreground">pz/h</small></span></div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${team === 'ms' ? 'bg-primary' : 'bg-cyan-500'}`} style={{ width: `${Math.max(5, (item.rate / maxRate) * 100)}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mt-4 grid grid-cols-2 gap-3">
            {(['ms', 'ga'] as TeamId[]).map((team) => {
              const item = report.teams[team];
              return (
                <div key={team} className="surface-card rounded-[22px] p-4">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${team === 'ms' ? 'bg-primary/10 text-primary' : 'bg-cyan-500/10 text-cyan-700'}`}>{TEAMS[team].short}</span>
                  <p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{formatNumber(item.units)} <small className="text-xs font-medium text-muted-foreground">pz</small></p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatNumber(item.hours, 1)} ore nette · {item.wins} vittorie</p>
                </div>
              );
            })}
          </section>

          <section className="surface-card mt-4 overflow-hidden rounded-[24px]">
            <div className="border-b p-5"><h2 className="font-semibold">Pezzi per formato</h2><p className="mt-1 text-xs text-muted-foreground">Quantità reali di ogni confezione</p></div>
            <div className="divide-y">
              {PRODUCTS.map((product) => (
                <div key={product.key} className="grid grid-cols-[1fr_60px_60px] items-center gap-3 px-5 py-3.5 text-sm">
                  <div><span className="font-medium">{product.label}</span><span className="ml-1 text-xs text-muted-foreground">{product.detail}</span></div>
                  <span className="text-right font-semibold">{formatNumber(report.teams.ms[product.key])}</span>
                  <span className="text-right font-semibold">{formatNumber(report.teams.ga[product.key])}</span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_60px_60px] gap-3 bg-muted/50 px-5 py-2 text-[10px] font-bold text-muted-foreground"><span></span><span className="text-right">M&amp;S</span><span className="text-right">G&amp;A</span></div>
            </div>
          </section>

          <section className="surface-card mt-4 rounded-[24px] p-5">
            <div className="flex items-center gap-2"><Users className="size-4 text-primary" /><h2 className="font-semibold">Condizioni di lavoro</h2></div>
            <div className="mt-4 divide-y">
              <ConditionRow label="Pause da 30 min" ms={report.teams.ms.pauses} ga={report.teams.ga.pauses} />
              <ConditionRow label="Turni con meno di 4" ms={report.teams.ms.reducedStaff} ga={report.teams.ga.reducedStaff} />
              <ConditionRow label="Pezzi per addetto/ora" ms={report.teams.ms.perPersonHour} ga={report.teams.ga.perPersonHour} decimal />
            </div>
          </section>

          <section className="mt-4 flex items-start gap-3 rounded-2xl border border-primary/10 bg-primary/7 px-4 py-3 text-xs leading-5 text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-primary" />
            L’indice orario rende eque le durate, ma il report lascia sempre separati acciaio, plastica e bag per non nascondere il mix prodotto.
          </section>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button onClick={() => { void onShare(); }} variant="outline" className="h-12 rounded-2xl"><Share2 className="size-4" /> Condividi</Button>
            <Button onClick={onCsv} className="h-12 rounded-2xl"><ArrowDownToLine className="size-4" /> Esporta CSV</Button>
          </div>
        </>
      )}
    </div>
  );
}

function ConditionRow({ label, ms, ga, decimal = false }: { label: string; ms: number; ga: number; decimal?: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_52px_52px] items-center gap-2 py-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold">{formatNumber(ms, decimal ? 1 : 0)}</span>
      <span className="text-right font-semibold">{formatNumber(ga, decimal ? 1 : 0)}</span>
    </div>
  );
}

function BottomNav({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  const items = [
    { id: 'today' as const, label: 'Oggi', icon: CalendarDays },
    { id: 'history' as const, label: 'Storico', icon: History },
    { id: 'report' as const, label: 'Report', icon: BarChart3 },
  ];
  return (
    <nav className="bottom-dock fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto grid max-w-sm grid-cols-3 rounded-[22px] p-1.5" aria-label="Navigazione principale">
      {items.map((item) => {
        const Icon = item.icon;
        const active = tab === item.id;
        return <button key={item.id} onClick={() => onTab(item.id)} className={`flex items-center justify-center gap-1.5 rounded-[17px] px-3 py-2.5 text-xs ${active ? 'dock-active font-semibold' : 'font-medium text-muted-foreground'}`} aria-current={active ? 'page' : undefined}><Icon className="size-4" />{item.label}</button>;
      })}
    </nav>
  );
}

function RecordDrawer({ open, onOpenChange, value, onChange, onSave }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ProductionRecord;
  onChange: (record: ProductionRecord) => void;
  onSave: () => void;
}) {
  function updateShift(slot: ShiftSlot, shift: ShiftEntry) {
    onChange({ ...value, [slot]: shift });
  }
  const weekend = isWeekend(value.date);
  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent className="mx-auto max-w-md rounded-t-[30px] bg-background">
        <DrawerHeader className="border-b px-5 pb-4 pt-6 text-left">
          <div className="flex items-start justify-between gap-4">
            <div><DrawerTitle className="text-xl font-semibold tracking-[-0.03em]">Registra giornata</DrawerTitle><DrawerDescription className="mt-1 text-left">Quantità dei due turni, senza calcoli a mano.</DrawerDescription></div>
            <button onClick={() => onOpenChange(false)} className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground" aria-label="Chiudi"><X className="size-4" /></button>
          </div>
        </DrawerHeader>

        <div className="overflow-y-auto px-5 py-5 pb-8">
          <label className="block" htmlFor="record-date">
            <span className="field-label">Data</span>
            <Input id="record-date" type="date" value={value.date} onChange={(event) => onChange({ ...value, date: event.target.value })} className="mt-2 h-12 rounded-2xl bg-card px-4 text-[15px]" />
          </label>
          {weekend && <p className="mt-2 flex items-center gap-2 text-xs text-amber-700"><TriangleAlert className="size-3.5" /> Questa data cade nel fine settimana.</p>}
          {isFriday(value.date) && <p className="mt-2 flex items-center gap-2 text-xs text-primary"><Clock3 className="size-3.5" /> Venerdì: 1 ora in meno applicata a entrambi.</p>}

          <div className="surface-card mt-5 flex items-center gap-4 rounded-2xl p-4">
            <div className="min-w-0 flex-1"><p className="font-semibold">Turno unico</p><p className="mt-0.5 text-xs leading-4 text-muted-foreground">Segnalo il giorno, ma lo escludo dal confronto</p></div>
            <Switch checked={value.isSingleShift} onCheckedChange={(checked) => onChange({ ...value, isSingleShift: checked })} />
          </div>

          {!value.isSingleShift && (
            <>
              <div className="mt-6">
                <span className="field-label">Chi ha fatto il mattino?</span>
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1.5">
                  {(['ms', 'ga'] as TeamId[]).map((team) => (
                    <button key={team} onClick={() => onChange({ ...value, morningTeam: team })} className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${value.morningTeam === team ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}>{TEAMS[team].short}</button>
                  ))}
                </div>
              </div>

              <ShiftForm slot="morning" date={value.date} team={value.morningTeam} shift={value.morning} onChange={(shift) => updateShift('morning', shift)} />
              <div className="my-6 h-px bg-border" />
              <ShiftForm slot="afternoon" date={value.date} team={value.morningTeam === 'ms' ? 'ga' : 'ms'} shift={value.afternoon} onChange={(shift) => updateShift('afternoon', shift)} />
            </>
          )}
        </div>

        <DrawerFooter className="border-t bg-background/92 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-xl">
          <Button onClick={onSave} className="h-13 rounded-2xl text-[15px] font-semibold">{value.isSingleShift ? 'Segna come escluso' : 'Salva giornata'}</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function ShiftForm({ slot, date, team, shift, onChange }: {
  slot: ShiftSlot;
  date: string;
  team: TeamId;
  shift: ShiftEntry;
  onChange: (shift: ShiftEntry) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const hours = shiftHours(slot, date, shift.pauseTaken);
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><span className={`shift-dot ${slot === 'morning' ? 'bg-amber-400' : 'bg-indigo-500'}`} /><h3 className="text-lg font-semibold">{slot === 'morning' ? 'Mattina' : 'Pomeriggio'}</h3></div>
          <p className="mt-1 text-xs text-muted-foreground">{TEAMS[team].name} · {formatNumber(hours, 2)} ore nette</p>
        </div>
        <span className="rounded-full bg-primary/8 px-3 py-1 text-[11px] font-bold text-primary">{TEAMS[team].short}</span>
      </div>

      <div className="mt-4 space-y-2.5">
        {PRODUCTS.map((product) => (
          <label key={product.key} htmlFor={`${slot}-${product.key}`} className="product-row surface-card flex items-center gap-3 rounded-2xl p-3">
            <span className={`product-icon product-${product.accent}`}><Package className="size-4" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{product.label}</span><span className="block text-[11px] text-muted-foreground">{product.detail}</span></span>
            <Input
              id={`${slot}-${product.key}`}
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              placeholder="0"
              value={shift[product.key] || ''}
              onChange={(event) => onChange({ ...shift, [product.key]: Math.max(0, Number(event.target.value)) })}
              className="h-11 w-24 rounded-xl bg-muted/70 text-right text-lg font-semibold tabular-nums focus:bg-card"
              aria-label={`${product.label} ${product.detail}, turno ${slot === 'morning' ? 'mattina' : 'pomeriggio'}`}
            />
          </label>
        ))}
      </div>

      <button onClick={() => setDetailsOpen((current) => !current)} className="mt-4 flex w-full items-center justify-between rounded-xl px-1 py-2 text-sm font-medium text-primary">
        <span>Pause e personale <small className="font-normal text-muted-foreground">(opzionale)</small></span>
        <ChevronDown className={`size-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
      </button>

      {detailsOpen && (
        <div className="mt-1 space-y-3 rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Pause className="size-4" /></span>
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Pausa da 30 min fatta</p><p className="text-[11px] text-muted-foreground">Se sì, viene tolta dalle ore produttive</p></div>
            <Switch checked={shift.pauseTaken} onCheckedChange={(checked) => onChange({ ...shift, pauseTaken: checked })} />
          </div>
          <div className="h-px bg-border" />
          <div>
            <div className="flex items-center justify-between"><span className="text-sm font-semibold">Addetti presenti</span><span className={`text-sm font-bold ${shift.staffCount < 4 ? 'text-amber-700' : 'text-primary'}`}>{shift.staffCount}</span></div>
            <div className="mt-3 grid grid-cols-5 gap-1.5">
              {[2, 3, 4, 5, 6].map((count) => <button key={count} onClick={() => onChange({ ...shift, staffCount: count })} className={`rounded-xl py-2 text-sm font-semibold ${shift.staffCount === count ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{count}</button>)}
            </div>
            {shift.staffCount < 4 && shift.steel25 > 0 && <p className="mt-3 flex items-center gap-2 text-[11px] leading-4 text-amber-700"><TriangleAlert className="size-3.5 shrink-0" /> Acciaio 25L segnalato automaticamente come produzione a 1 testa.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
