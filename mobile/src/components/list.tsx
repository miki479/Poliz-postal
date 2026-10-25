import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { FlatList, RefreshControl, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Empty } from '@/components/ui';
import { C, S } from '@/constants/theme';
import { call } from '@/lib/api';

import { humanError } from '@/lib/errors';
/** Lista a scorrimento con pull-to-refresh che carica i dati da un metodo del server. */
export function ApiList<T extends { id: string }>({ title, method, args = [], render, emptyTitle, emptyText }: {
  title: string;
  method: string;
  args?: unknown[];
  render: (item: T) => ReactElement;
  emptyTitle: string;
  emptyText?: string;
}) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await call<T[]>(method, ...args));
      setError('');
    } catch (e) {
      setError(humanError(e, 'Errore.'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <FlatList
      data={items ?? []}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => render(item)}
      contentContainerStyle={{ padding: S.lg, paddingTop: insets.top + S.lg, paddingBottom: 100, gap: S.sm }}
      refreshControl={
        <RefreshControl
          tintColor={C.accent}
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
      ListHeaderComponent={<Text style={{ color: C.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.4, marginBottom: S.sm }}>{title}</Text>}
      ListEmptyComponent={items === null && !error ? undefined : error ? <Empty title="Non riesco a caricare" text={error} /> : <Empty title={emptyTitle} text={emptyText} />}
    />
  );
}
