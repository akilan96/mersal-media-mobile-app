import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { planEventReminders } from '../domain/eventReminders';
import { formatDate, formatTime } from '../domain/helpers';
import type { StudioEvent } from '../domain/types';

const channelId = 'upcoming-shoots';
const source = 'mersal-event-reminder';
const permissionPromptKey = '@mersal/event-reminder-permission-requested';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function sync(events: StudioEvent[]) {
  const reminders = planEventReminders(events).slice(0, Platform.OS === 'ios' ? 60 : undefined);
  if (reminders.length && Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(channelId, {
      name: 'Upcoming shoots',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  let permissions = await Notifications.getPermissionsAsync();
  if (reminders.length && !permissions.granted && permissions.canAskAgain &&
    !(await AsyncStorage.getItem(permissionPromptKey))) {
    permissions = await Notifications.requestPermissionsAsync();
    await AsyncStorage.setItem(permissionPromptKey, 'yes');
  }

  const desired = new Map((permissions.granted ? reminders : []).map(({ event, hours, at }) => {
    const title = hours === 1 ? 'Shoot in 1 hour' : `Shoot in ${hours} hours`;
    const body = `${event.title} · ${formatDate(event.date)} at ${formatTime(event.date)} · ${event.location}`;
    const identifier: string = `mersal-${event.id}-${hours}`;
    return [identifier, { at, title, body, eventId: event.id }] as const;
  }));

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const item of scheduled) {
    if (item.content.data?.source !== source) continue;
    const next = desired.get(item.identifier);
    if (next && item.content.data.at === next.at && item.content.title === next.title && item.content.body === next.body) {
      desired.delete(item.identifier);
    } else {
      await Notifications.cancelScheduledNotificationAsync(item.identifier);
    }
  }
  for (const [identifier, reminder] of desired) {
    if (reminder.at <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: reminder.title,
        body: reminder.body,
        sound: 'default',
        data: { source, at: reminder.at, eventId: reminder.eventId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder.at,
        ...(Platform.OS === 'android' ? { channelId } : {}),
      },
    });
  }
}

let queue: Promise<void> = Promise.resolve();

export function syncEventReminders(events: StudioEvent[]) {
  const task = queue.then(() => sync(events));
  queue = task.catch(() => {});
  return task;
}
