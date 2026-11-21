import React, { useEffect, useState, type ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, View, type ListRenderItem, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useStudioTheme } from '../theme';
import { Button, Screen } from './ui';

const pageSize = 3;

export function PagedList<T extends { id: string }>({ items, scope, renderItem, header, empty, createAction }: {
  items: T[];
  scope: string;
  renderItem: ListRenderItem<T>;
  header: ReactElement;
  empty: ReactElement;
  createAction?: { label: string; onPress: () => void };
}) {
  const [page, setPage] = useState({ scope, limit: pageSize });
  const limit = page.scope === scope ? page.limit : pageSize;
  const hasMore = limit < items.length;
  useEffect(() => {
    setPage(previous => previous.scope === scope ? previous : { scope, limit: pageSize });
  }, [scope]);

  function loadMore() {
    if (!hasMore) return;
    setPage(previous => {
      const current = previous.scope === scope ? previous.limit : pageSize;
      if (current !== limit) return previous;
      return { scope, limit: Math.min(current + pageSize, items.length) };
    });
  }

  function onScroll({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
    if (contentOffset.y > 0 && contentSize.height - (contentOffset.y + layoutMeasurement.height) < 56) loadMore();
  }

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <FlatList
        style={styles.list}
        data={items.slice(0, limit)}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        initialNumToRender={pageSize}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={styles.header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={Separator}
        ListFooterComponent={hasMore ? <View style={styles.footer}><Button title="Load more" icon="chevron-down" variant="ghost" onPress={loadMore} /></View> : undefined}
        contentContainerStyle={[styles.content, createAction && styles.contentWithAction]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={hasMore ? onScroll : undefined}
        scrollEventThrottle={32}
      />
      {createAction && <FloatingCreateButton {...createAction} />}
    </Screen>
  );
}

export function FloatingCreateButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useStudioTheme();
  return <View pointerEvents="box-none" style={styles.actionPosition}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [styles.createButton, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}>
      <View pointerEvents="none" accessible={false} style={styles.plus}>
        <View style={[styles.plusHorizontal, { backgroundColor: colors.onPrimary }]} />
        <View style={[styles.plusVertical, { backgroundColor: colors.onPrimary }]} />
      </View>
    </Pressable>
  </View>;
}

function Separator() { return <View style={styles.separator} />; }

const styles = StyleSheet.create({
  screen: { padding: 0, paddingBottom: 0, minHeight: 0 },
  list: { flex: 1, minHeight: 0 },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
  contentWithAction: { paddingBottom: 84 },
  actionPosition: { position: 'absolute', right: 18, bottom: 16, zIndex: 10, elevation: 8 },
  createButton: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  plus: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  plusHorizontal: { position: 'absolute', width: 21, height: 2.5, borderRadius: 2 },
  plusVertical: { position: 'absolute', width: 2.5, height: 21, borderRadius: 2 },
  header: { marginBottom: 12 },
  separator: { height: 12 },
  footer: { gap: 8, paddingTop: 12 },
});
