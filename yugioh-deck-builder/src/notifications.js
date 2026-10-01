// Expo push notification setup: permissions, Android channel, and the Expo Push Token.
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

// Show notifications even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Asks for permission and returns this device's Expo Push Token
 * (looks like "ExponentPushToken[xxxx]"). Throws with a readable message on failure.
 */
export async function getExpoPushToken() {
  if (Platform.OS === 'web') throw new Error('Push notifications are not supported on web.');
  if (!Device.isDevice) throw new Error('Push notifications need a real phone, not a simulator.');

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      lightColor: '#6b3fd4',
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') throw new Error('Notification permission was denied.');

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error('No EAS projectId found. Run `npx eas-cli@latest init` in the project folder.');
  }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

export const deviceName = () => Device.deviceName ?? Device.modelName ?? 'Unknown device';
