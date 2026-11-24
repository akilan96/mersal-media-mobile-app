import { PagedList } from '../components/PagedList';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useStudioNavigation } from '../navigation/useStudioNavigation';
import { Badge, Button, Card, Chip, EmptyState, ErrorMessage, Field, Header, IconButton } from '../components/ui';
import { useStudioTheme, type Palette } from '../theme';
import { useStudio } from '../state/StudioProvider';
import { useToast } from '../components/Toast';
import { useConfirmation } from '../components/ConfirmationDialog';
import { formatTime, money, upcomingEvents } from '../domain/helpers';
import type { EventListFilter, MainTabParamList, StudioEvent } from '../domain/types';

const filterTitles: Record<EventListFilter, string> = {
  all: 'Your shoots', total: 'Total Shoots', upcoming: 'Upcoming Shoots',
  completed: 'Completed Shoots', editing: 'Pending Edits',
};

export default function EventsScreen() {
  const confirm = useConfirmation();
  const showToast = useToast();
  const { colors, ui } = useStudioTheme();
  const styles = makeStyles(colors);
 
  const navigation = useStudioNavigation();
  const route = useRoute<RouteProp<MainTabParamList, 'Events'>>();
  const filter = route.params?.filter ?? 'all';
  const openedAt = route.params?.openedAt;
  const { data, deleteEvent } = useStudio();
  const [sort, setSort] = useState<'Newest' | 'Date' | 'Name' | 'Amount'>('Newest');
  const [query, setQuery] = useState('');
  useEffect(() => {
    setQuery('');
    setSort('Newest');
  }, [filter, openedAt]);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string>();
  const filtered = useMemo(() => {
    switch (filter) {
      case 'total': return data.events.filter(event => event.status !== 'Cancelled');
      case 'upcoming': return upcomingEvents(data.events, openedAt === undefined ? new Date() : new Date(openedAt));
      case 'completed': return data.events.filter(event => event.status === 'Completed');
      case 'editing': return data.events.filter(event => event.status === 'Editing');
      default: return data.events;
    }
  }, [data.events, filter, openedAt]);
  const events = useMemo(() => {
    const term = query.trim().toLowerCase();
    const candidates = term ? [...filtered.filter(event => !event.inactive), ...data.events.filter(event => event.inactive)] : filtered.filter(event => !event.inactive);
    return candidates.filter(event => `${event.title} ${event.location} ${event.type}`.toLowerCase().includes(term)).sort((a, b) => {
      if (sort === 'Name') return a.title.localeCompare(b.title);
      if (sort === 'Amount') return b.totalAmount - a.totalAmount;
      if (sort === 'Newest') return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }, [data.events, filtered, query, sort]);
  function confirmDelete(event: StudioEvent) {
    confirm({ title: 'Make event inactive?', message: `“${event.title}” will be hidden from the list. Search for it to view its details.`,
      icon: 'eye-off', cancelLabel: 'Keep event', confirmLabel: 'Make inactive', destructive: true, onConfirm: async () => {
        setDeleting(event.id); setError('');
        try {
          await deleteEvent(event.id);
          showToast('Event marked inactive');
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not make this event inactive. Try again.'); }
        finally { setDeleting(undefined); }
      } });
  }
  return (
    <PagedList items={events} scope={JSON.stringify([filter, openedAt, query, sort])} createAction={{ label: 'Create event', onPress: () => navigation.navigate('CreateEvent') }} header={<View style={ui.gap}>
      <Header subtitle="EVENTS" />
      <View style={ui.between}><View><Text style={ui.title}>{filterTitles[filter]}</Text><Text style={ui.body}>{events.length} {events.length === 1 ? 'event' : 'events'}</Text></View><View style={styles.headerIcon}><Feather name="calendar" size={26} color={colors.primary} /></View></View>
      {filter !== 'all' && <Button title="Show all events" variant="secondary" onPress={() => navigation.navigate('Events', { filter: 'all' })} />}
      <Field icon="search" placeholder="Search events or venues" accessibilityLabel="Search events or venues" value={query} onChangeText={setQuery} autoCorrect={false} />
      <View style={[ui.row, { flexWrap: 'wrap', gap: 8 }]}><Text style={ui.small}>Sort by:</Text>{(['Newest', 'Date', 'Name', 'Amount'] as const).map(item => <Chip key={item} label={item} selected={sort === item} onPress={() => setSort(item)} />)}</View>
      {!!error && <ErrorMessage message={error} />}
    </View>}
    renderItem={({ item: event }) => {
          const date = new Date(event.date);
          const client = data.clients.find(item => item.id === event.clientId);
          return <Card key={event.id} style={{ padding: 0 }}>
            <View style={styles.eventRow}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Open ${event.title}`} onPress={() => navigation.navigate('EventDetails', { eventId: event.id })} style={({ pressed }) => [styles.eventMain, pressed && { opacity: 0.65 }]}>
                <View style={styles.date}><Text style={styles.day}>{date.getDate()}</Text><Text style={styles.month}>{date.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}</Text></View>
                <View style={{ flex: 1, gap: 4 }}><Text style={styles.eventTitle}>{event.title}</Text>{client && <View style={styles.clientLine}><Feather name="user" size={13} color={colors.primaryDark} /><Text style={[ui.small, ui.flex, { color: colors.primaryDark }]}>{client.name}</Text></View>}<Text style={ui.small} numberOfLines={2}>{event.location} · {formatTime(event.date)}</Text><Text style={styles.year}>{date.getFullYear()} · {money(event.totalAmount)}</Text><View style={{ alignSelf: 'flex-start' }}><Badge label={event.status} tone={event.status === 'Completed' ? 'success' : event.status === 'Cancelled' ? 'error' : 'teal'} /></View></View>
                {event.inactive && <Badge label="Inactive" tone="neutral" />}
                <Feather name="chevron-right" size={19} color={colors.primary} />
              </Pressable>
              {!event.inactive && <View style={styles.delete}><IconButton name={deleting === event.id ? 'clock' : 'trash-2'} label={`Make ${event.title} inactive`} onPress={() => { if (!deleting) confirmDelete(event); }} color={colors.muted} /></View>}
            </View>
          </Card>;
    }}
    empty={<EmptyState icon="calendar" title={query.trim() || filter !== 'all' ? 'No matching events' : 'Your next story starts here'} description={query.trim() ? 'Try another event name, type or venue.' : filter !== 'all' ? 'Events in this category will appear here.' : 'Create your first shoot to organise your schedule, crew and payments.'} action={query ? <Button title="Clear search" variant="secondary" onPress={() => setQuery('')} /> : undefined} />}
    />
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  headerIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  eventRow: { flexDirection: 'row', alignItems: 'center' },
  eventMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, paddingRight: 0 },
  date: { width: 54, height: 64, borderRadius: 15, backgroundColor: colors.mint, borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  day: { color: colors.text, fontSize: 23, fontFamily: 'InterExtraBold' },
  month: { color: colors.primary, fontSize: 10, fontFamily: 'InterExtraBold', letterSpacing: 0.7 },
  clientLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  eventTitle: { color: colors.text, fontSize: 14, fontFamily: 'InterExtraBold' },
  year: { color: colors.muted, fontSize: 10, fontFamily: 'InterMedium' },
  delete: { paddingHorizontal: 5 },
});
