import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useStudioTheme, type Palette } from '../theme';
import { useStudio } from '../state/StudioProvider';
import type { MainTabParamList, RootStackParamList } from '../domain/types';
import HomeScreen from '../screens/HomeScreen';
import EventsScreen from '../screens/EventsScreen';
import CreateEventScreen from '../screens/CreateEventScreen';
import EventDetailsScreen from '../screens/EventDetailsScreen';
import ClientsScreen from '../screens/ClientsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import PaymentsScreen from '../screens/PaymentsScreen';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { PhotosScreen } from '../screens/PhotosScreen';
import AccountsScreen from '../screens/AccountsScreen';
import { ClientFavouritesScreen, ClientHelpScreen, ClientPhotosScreen } from '../screens/ClientAreaScreens';
const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();
const ClientTabs = createBottomTabNavigator<{ Photos: undefined; Favourites: undefined; Help: undefined }>();
const makeNavigationTheme = (colors: Palette, dark: boolean) => ({ ...DefaultTheme, dark, colors: { ...DefaultTheme.colors, primary: colors.primary, background: colors.background, card: colors.card, text: colors.text, border: colors.border } });
const icons = { Home: 'home', Events: 'calendar', Photos: 'image', Clients: 'users', Settings: 'settings', Favourites: 'heart', Help: 'help-circle' } as const;
function TabHighlight({ selected, reduceMotion }: { selected: boolean; reduceMotion: boolean }) {
  const { colors } = useStudioTheme();
  const styles = makeStyles(colors);
 
  const progress = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => {
    const target = selected ? 1 : 0;
    if (reduceMotion) {
      progress.setValue(target);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: target,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduceMotion, selected]);

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
  return <Animated.View pointerEvents="none" style={[styles.active, { opacity: progress, transform: [{ scale }] }]} />;
}
export function BottomNavigation({ state, descriptors, navigation, reduceMotion }: BottomTabBarProps & { reduceMotion: boolean }) {
  const { colors } = useStudioTheme();
  const styles = makeStyles(colors);
 
  const insets = useSafeAreaInsets();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (keyboardOpen) return null;
  return <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>{state.routes.map((route, index) => {
    const selected = index === state.index;
    const options = descriptors[route.key].options;
    return <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={options.tabBarAccessibilityLabel ?? route.name} accessibilityState={{ selected }} onPress={() => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    }} onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })} style={styles.tab}>
      <View style={styles.indicator}>
        <View style={styles.iconPill}>
          <TabHighlight selected={selected} reduceMotion={reduceMotion} />
          <Feather name={icons[route.name as keyof typeof icons]} size={18} color={selected ? colors.onPrimary : colors.muted} />
        </View>
        <Text style={[styles.tabLabel, selected && styles.selectedLabel]}>{route.name}</Text>
      </View>
    </Pressable>;
  })}</View>;
}
function MainTabs() {
  const { colors } = useStudioTheme();
 
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let active = true;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (active) setReduceMotion(enabled);
    }).catch(() => {});
    return () => { active = false; subscription.remove(); };
  }, []);
  return <Tabs.Navigator screenOptions={{ headerShown: false, animation: reduceMotion ? 'none' : 'fade', sceneStyle: { backgroundColor: colors.background } }} tabBar={props => <BottomNavigation {...props} reduceMotion={reduceMotion} />}>
  <Tabs.Screen name="Home" component={HomeScreen} /><Tabs.Screen name="Events" component={EventsScreen} /><Tabs.Screen name="Photos" component={PhotosScreen} /><Tabs.Screen name="Clients" component={ClientsScreen} /><Tabs.Screen name="Settings" component={SettingsScreen} />
</Tabs.Navigator>; }

function ClientArea() {
  const { colors } = useStudioTheme();
  return <ClientTabs.Navigator screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
    tabBar={props => <BottomNavigation {...props} reduceMotion />}>
    <ClientTabs.Screen name="Photos" component={ClientPhotosScreen} />
    <ClientTabs.Screen name="Favourites" component={ClientFavouritesScreen} />
    <ClientTabs.Screen name="Help" component={ClientHelpScreen} />
  </ClientTabs.Navigator>;
}

export function AppNavigator() {
  const { colors, dark } = useStudioTheme();
 
  const { authenticated, configured, role } = useStudio();
  return <NavigationContainer theme={makeNavigationTheme(colors, dark)}><Stack.Navigator key={authenticated ? role ?? 'studio' : configured ? 'unlock' : 'setup'} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} initialRouteName={authenticated ? 'Main' : configured ? 'Login' : 'Welcome'}>
    {authenticated ? role === 'client' ? <Stack.Screen name="Main" component={ClientArea} /> : <>
      <Stack.Screen name="Main" component={MainTabs} /><Stack.Screen name="CreateEvent" component={CreateEventScreen} /><Stack.Screen name="EventDetails" component={EventDetailsScreen} /><Stack.Screen name="Payments" component={PaymentsScreen} />
      {role === 'owner' && <Stack.Screen name="Accounts" component={AccountsScreen} />}
    </> : <>{!configured && <Stack.Screen name="Welcome" component={WelcomeScreen} />}<Stack.Screen name="Login" component={LoginScreen} /></>}
  </Stack.Navigator></NavigationContainer>;
}
const makeStyles = (colors: Palette) => StyleSheet.create({
  bar: { backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, paddingHorizontal: 8, flexDirection: 'row', shadowColor: '#193B4B', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.04, shadowRadius: 15, elevation: 10 },
  tab: { flex: 1, alignItems: 'center', marginHorizontal: 2 },
  indicator: { minHeight: 48, width: '100%', paddingVertical: 2, gap: 3, alignItems: 'center', justifyContent: 'center' },
  iconPill: { width: 40, maxWidth: '100%', height: 30, alignItems: 'center', justifyContent: 'center' },
  active: { ...StyleSheet.absoluteFill, borderRadius: 999, backgroundColor: colors.primary },
  tabLabel: { color: colors.muted, fontSize: 10, fontFamily: 'InterMedium' },
  selectedLabel: { color: colors.primaryDark, fontFamily: 'InterBold' },
});
