import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import { ToastProvider } from './src/components/Toast';
import { daisyThemes } from './src/daisyThemes';
import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useEventReminders } from './src/navigation/useEventReminders';
import { StudioProvider, useStudio } from './src/state/StudioProvider';
import { Brand, Button, Card, ErrorMessage, Screen } from './src/components/ui';
import { settingsThemes, ThemeContext, useStudioTheme } from './src/theme';
class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <Screen><Brand /><Card><Text style={{ fontFamily: 'InterBold' }}>Your studio couldn’t open</Text><Text style={{ marginTop: 12 }}>Your saved records have not been erased. Restart the app or try again.</Text></Card><ErrorMessage message={this.state.error} /><Button title="Try Again" onPress={() => this.setState({ error: null })} /></Screen> : this.props.children; }
}
function ThemedStudio() {
  const { data } = useStudio();
  const theme = settingsThemes.find(option => option === data.theme) ?? 'light';
  return <ThemeContext.Provider value={theme}><StatusBar style={theme !== 'pancake' && daisyThemes[theme].dark ? 'light' : 'dark'} /><ToastProvider><StudioApp /></ToastProvider></ThemeContext.Provider>;
}
function StudioApp() {
  useEventReminders();
  const { colors, ui } = useStudioTheme();
  const { cloud, loading, storageError, retryLoad } = useStudio();
  if (loading) return <Screen scroll={false} contentStyle={{ justifyContent: 'center', alignItems: 'center', gap: 24 }}><Brand /><ActivityIndicator size="large" color={colors.primary} /><Text style={ui.body}>Opening your studio…</Text></Screen>;
  if (storageError) return <Screen><Brand /><Card><Text style={ui.heading}>{cloud ? 'Could not load your studio' : 'Local storage needs attention'}</Text><Text style={[ui.body, { marginTop: 10 }]}>Your saved records have been preserved. Try opening the studio again.</Text></Card><ErrorMessage message={storageError} /><Button title="Retry" onPress={retryLoad} /></Screen>;
  return <AppNavigator />;
}
const studioFonts = {
  InterRegular: Inter_400Regular,
  InterMedium: Inter_500Medium,
  InterSemiBold: Inter_600SemiBold,
  InterBold: Inter_700Bold,
  InterExtraBold: Inter_800ExtraBold,
};

export default function App() {
  const [loaded, fontError] = useFonts(studioFonts);
  if (!loaded && !fontError) return null;
  return <SafeAreaProvider><AppErrorBoundary><StudioProvider><ThemedStudio /></StudioProvider></AppErrorBoundary></SafeAreaProvider>; }
