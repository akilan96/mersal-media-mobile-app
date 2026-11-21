import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useStudio } from '../state/StudioProvider';

export function useEventReminders() {
  const { authenticated, loading, storageError, data } = useStudio();
  const events = data.events;
  useEffect(() => {
    if (Platform.OS === 'web' || loading || storageError || !authenticated) return;
    let active = true;
    function refresh() {
      void import('../services/eventReminders').then(module => {
        if (active) return module.syncEventReminders(events);
      }).catch(error => console.warn('Could not schedule event reminders:', error));
    }
    refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [authenticated, events, loading, storageError]);
}
