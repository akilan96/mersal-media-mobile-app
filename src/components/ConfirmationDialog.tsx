import React, { createContext, useContext, useState, type ComponentProps, type ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useStudioTheme } from '../theme';
import { Button } from './ui';

type Confirmation = {
  title: string;
  message: string;
  icon: ComponentProps<typeof Feather>['name'];
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm(): void;
};

const ConfirmationContext = createContext<(confirmation: Confirmation) => void>(() => {});
export const useConfirmation = () => useContext(ConfirmationContext);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<Confirmation | null>(null);
  const { colors, ui } = useStudioTheme();
  const dismiss = () => setDialog(null);

  return <ConfirmationContext.Provider value={setDialog}>
    {children}
    {dialog && <Modal transparent statusBarTranslucent animationType="none" onRequestClose={dismiss}>
      <SafeAreaView style={styles.backdrop}>
        <View accessibilityViewIsModal style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ScrollView bounces={false} style={styles.scroller} contentContainerStyle={styles.body}>
            <View style={[styles.icon, { backgroundColor: dialog.destructive ? colors.errorBg : colors.mint }]}>
              <Feather name={dialog.icon} size={25} color={dialog.destructive ? colors.error : colors.primaryDark} />
            </View>
            <Text accessibilityRole="header" style={[ui.heading, styles.title]}>{dialog.title}</Text>
            <Text style={[ui.body, styles.message]}>{dialog.message}</Text>
          </ScrollView>
          <View style={styles.actions}>
            <Button style={styles.button} title={dialog.cancelLabel ?? 'Cancel'} variant="secondary" onPress={dismiss} />
            <Button style={styles.button} title={dialog.confirmLabel} variant={dialog.destructive ? 'danger' : 'primary'}
              onPress={() => {
                dismiss();
                requestAnimationFrame(dialog.onConfirm);
              }} />
          </View>
        </View>
      </SafeAreaView>
    </Modal>}
  </ConfirmationContext.Provider>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#07151BB8' },
  card: { width: '100%', maxWidth: 392, maxHeight: '90%', borderRadius: 26, borderWidth: 1, padding: 18, elevation: 12 },
  scroller: { flexGrow: 0, flexShrink: 1 },
  body: { alignItems: 'center', gap: 10, paddingBottom: 16 },
  icon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { textAlign: 'center', fontSize: 21 },
  message: { textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 9 },
  button: { flex: 1 },
});
