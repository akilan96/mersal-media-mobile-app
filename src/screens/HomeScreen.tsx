import React, { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useStudioNavigation } from '../navigation/useStudioNavigation';
import { CameraArt, Card, EmptyState, Header, Screen, SectionTitle } from '../components/ui';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { formatTime, upcomingEvents } from '../domain/helpers';
import { useStudio } from '../state/StudioProvider';
import { useStudioTheme, type Palette } from '../theme';
import type { StudioEvent } from '../domain/types';
function greeting() { const hour = new Date().getHours(); return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Good night'; }
const sampleNoticeKey = '@mersal/sample-notifications-viewed';
const sampleNotices = [
  { title: 'Welcome to Mersal Media', message: 'Sample notification · Your studio dashboard is ready.' },
  { title: 'Shoot reminder', message: 'Sample notification · Review your upcoming shoots before heading out.' },
];
export default function HomeScreen() {
  const { colors, ui } = useStudioTheme();
  const styles = makeStyles(colors);
 
  const { data } = useStudio();
  const navigation = useStudioNavigation();
  const { width, fontScale } = useWindowDimensions();
  const stackHero = width < 340 || fontScale >= 1.4;
  const [now, setNow] = useState(new Date());
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  React.useEffect(() => {
    let active = true;
    AsyncStorage.getItem(sampleNoticeKey).then(viewed => {
      if (active) setShowSamples(viewed === null);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  useFocusEffect(useCallback(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []));
  const upcoming = upcomingEvents(data.events, now);
  const noticeCount = upcoming.length + (showSamples ? sampleNotices.length : 0);
  function closeReminders() {
    setRemindersOpen(false);
    if (showSamples) {
      setShowSamples(false);
      void AsyncStorage.setItem(sampleNoticeKey, 'true').catch(() => {});
    }
  }
  const openEvent = (eventId: string) => navigation.navigate('EventDetails', { eventId });
  const metrics = [
    { label: 'Total Shoots', filter: 'total' as const, value: data.events.filter(e => e.status !== 'Cancelled').length, icon: 'calendar' as const, caption: 'All Time', tone: 'mint' as const },
    { label: 'Upcoming', filter: 'upcoming' as const, value: upcoming.length, icon: 'clock' as const, caption: 'Scheduled', tone: 'blue' as const },
    { label: 'Completed', filter: 'completed' as const, value: data.events.filter(e => e.status === 'Completed').length, icon: 'check-circle' as const, caption: 'Delivered', tone: 'gold' as const },
    { label: 'Pending Edits', filter: 'editing' as const, value: data.events.filter(e => e.status === 'Editing').length, icon: 'edit' as const, caption: 'In Studio', tone: 'teal' as const },
  ];
  return <Screen onRefresh={() => setNow(new Date())} refreshing={false}>
    <Header right={
      <Pressable accessibilityRole="button" accessibilityLabel={`Notifications, ${noticeCount}`}
        onPress={() => setRemindersOpen(true)}
        style={({ pressed }) => [styles.bell, pressed && { backgroundColor: colors.mint }]}>
        <Feather name="bell" size={23} color={colors.text} />
        {noticeCount > 0 && <View style={styles.bellBadge}>
          <Text style={styles.bellCount}>{noticeCount > 99 ? '99+' : noticeCount}</Text>
        </View>}
      </Pressable>
    } />
    <Modal visible={remindersOpen} animationType="slide" onRequestClose={closeReminders}>
      <Screen>
        <Header title="Notifications" subtitle="Upcoming shoot reminders" onBack={closeReminders} />
        {showSamples && sampleNotices.map(notice => (
          <Card key={notice.title} style={ui.row}>
            <Feather name="bell" size={20} color={colors.primary} />
            <View style={ui.flex}>
              <Text style={ui.label}>{notice.title}</Text>
              <Text style={ui.small}>{notice.message}</Text>
            </View>
          </Card>
        ))}
        {upcoming.map(event => (
          <UpcomingCard key={event.id} event={event} onPress={() => {
            closeReminders();
            openEvent(event.id);
          }} />
        ))}
        {noticeCount === 0 && <EmptyState icon="bell" title="No reminders yet" description="Scheduled shoots will appear here as reminders." />}
      </Screen>
    </Modal>
    <View style={[styles.hero, stackHero && styles.stackedHero]}>
      <View style={styles.greeting}><Text style={ui.body}>Welcome, {greeting()}</Text><Text accessibilityRole="header" style={[ui.title, styles.name]}>{data.profile?.name || 'Photographer'}!</Text><Text style={[ui.body, { fontSize: 13 }]}>Manage your events, photos and clients all in one place.</Text></View>
      <View style={styles.heroArt}>
        <CameraArt uri={data.homePhoto} size={stackHero ? 154 : Math.min(154, Math.round(width * 0.34))} />
      </View>
    </View>
    <SectionTitle title="Overall Status" />
    <View style={styles.grid}>
      {metrics.map(metric => <MetricCard key={metric.tone} {...metric}
        onPress={() => navigation.navigate('Events', { filter: metric.filter, openedAt: Date.now() })} />)}
    </View>
    <SectionTitle title="Upcoming Events" action="View All" onAction={() => navigation.navigate('Events', { filter: 'all', openedAt: Date.now() })} />
    {upcoming.length ? upcoming.slice(0, 3).map(event => <UpcomingCard key={event.id} event={event} onPress={() => openEvent(event.id)} />) : <EmptyState icon="calendar" title="No upcoming shoots" description="Scheduled shoots will appear here." />}
    <Text style={[ui.small, { textAlign: 'center', paddingTop: 8 }]}>Your studio. A little more organized.</Text>
  </Screen>;
}
const metricColors = {
  mint: { surface: ['#FFFFFF', '#EDFFF7'], tile: ['#2ED4A9', '#128A70'], wave: '#11C997' },
  blue: { surface: ['#FFFFFF', '#EAF8FF'], tile: ['#55CBFA', '#168AC7'], wave: '#20A8EE' },
  gold: { surface: ['#FFFFFF', '#FFF9E2'], tile: ['#FFE055', '#DFA800'], wave: '#EAB500' },
  teal: { surface: ['#FFFFFF', '#EBFFF9'], tile: ['#20D4A4', '#087A66'], wave: '#09C8A0' },
} as const;
const waveLine = 'M0 43 C15 46 25 22 40 22 S56 38 70 23 S91 -4 103 9';

function MetricCard({ label, value, icon, caption, tone, onPress }: {
  label: string;
  value: number;
  icon: React.ComponentProps<typeof Feather>['name'];
  caption: string;
  tone: keyof typeof metricColors;
  onPress: () => void;
}) {
  const { colors, ui, themeName } = useStudioTheme();
  const styles = makeStyles(colors);
 
  const palette = metricColors[tone];
  const gradientId = `metric-wave-${tone}`;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.metricWrap, pressed && { opacity: 0.78 }]} accessibilityLabel={`${label}: ${value}, ${caption}`}>
      <LinearGradient colors={themeName === 'dark' ? [colors.card, colors.card] : themeName === 'light' ? palette.surface : [colors.card, colors.mint]} style={styles.metric}>
        <View style={styles.metricHeader}>
          <LinearGradient colors={palette.tile} style={styles.metricIcon}>
            <Feather name={icon} size={21} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.metricLabel}>{label}</Text>
        </View>
        <View style={styles.metricBody}>
          <View style={ui.flex}>
            <Text style={styles.value}>{value}</Text>
            <Text style={styles.metricCaption}>{caption}</Text>
          </View>
          <View style={styles.metricWave} pointerEvents="none" importantForAccessibility="no-hide-descendants">
            <Svg width="100%" height="100%" viewBox="0 0 104 58">
              <Defs>
                <SvgGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                  <Stop offset="0" stopColor={palette.wave} stopOpacity={0.4} />
                  <Stop offset="1" stopColor={palette.wave} stopOpacity={0} />
                </SvgGradient>
              </Defs>
              <Path d={`${waveLine} L103 58 H0 Z`} fill={`url(#${gradientId})`} />
              <Path d={waveLine} fill="none" stroke={palette.wave} strokeWidth={1.5} />
            </Svg>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}
function UpcomingCard({ event, onPress }: { event: StudioEvent; onPress: () => void }) {
  const { colors, ui } = useStudioTheme();
  const styles = makeStyles(colors);
 
  const date = new Date(event.date);
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${event.title}, ${date.toLocaleDateString()}, ${formatTime(event.date)}`}><Card style={ui.row}><View style={styles.dateBadge}><Text style={styles.day}>{date.getDate()}</Text><Text style={styles.month}>{date.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}</Text></View><View style={[ui.flex, { gap: 5 }]}><Text numberOfLines={2} style={ui.label}>{event.title}</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Feather name="map-pin" size={12} color={colors.primary} /><Text numberOfLines={2} style={[ui.small, ui.flex]}>{event.location} · {formatTime(event.date)}</Text></View></View><Feather name="chevron-right" size={19} color={colors.primary} /></Card></Pressable>;
}
const makeStyles = (colors: Palette) => StyleSheet.create({
  bell: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: 2, right: 1, minWidth: 18, minHeight: 18, paddingHorizontal: 4, borderRadius: 999, backgroundColor: '#FFDA32', alignItems: 'center', justifyContent: 'center' },
  bellCount: { color: '#442C20', fontSize: 10, fontFamily: 'InterExtraBold' },
  hero: { minHeight: 154, flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 5, paddingBottom: 10 },
  stackedHero: { flexDirection: 'column', alignItems: 'stretch' },
  heroArt: { alignSelf: 'center' },
  greeting: { flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 8 },
  name: { borderLeftWidth: 4, borderColor: colors.primary, paddingLeft: 9, fontSize: 27 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricWrap: { flexGrow: 1, flexBasis: '45%', borderRadius: 18, backgroundColor: colors.card, elevation: 2, shadowColor: '#248B7B', shadowOpacity: 0.13, shadowRadius: 7, shadowOffset: { width: 0, height: 4 } },
  metric: { flex: 1, minHeight: 113, borderRadius: 18, borderWidth: 1.5, borderColor: colors.border, padding: 10, gap: 6 },
  metricHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricIcon: { width: 37, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { flex: 1, color: colors.text, fontSize: 13, fontFamily: 'InterBold' },
  metricBody: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  metricCaption: { color: colors.text, fontSize: 12 },
  metricWave: { width: '41%', height: 37 },
  value: { color: colors.text, fontSize: 29, fontFamily: 'InterExtraBold', letterSpacing: -0.7 },
  dateBadge: { width: 51, height: 55, backgroundColor: colors.mint, borderWidth: 1, borderColor: colors.border, borderRadius: 14, justifyContent: 'center', alignItems: 'center', gap: 3 }, day: { color: colors.text, fontSize: 22, fontFamily: 'InterExtraBold' }, month: { color: colors.primary, fontSize: 10, fontFamily: 'InterExtraBold' },
});
