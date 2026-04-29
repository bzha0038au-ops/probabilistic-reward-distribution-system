import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

type SupportedPushPlatform = "ios" | "android";

let handlerConfigured = false;
const configuredExpoProjectId =
  process.env.EXPO_PUBLIC_EXPO_PROJECT_ID?.trim() ||
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() ||
  Constants.expoConfig?.extra?.eas?.projectId ||
  Constants.easConfig?.projectId ||
  null;

const missingExpoProjectIdReason =
  "missing_expo_project_id: Configure EXPO_PUBLIC_EXPO_PROJECT_ID or extra.eas.projectId.";
const missingAndroidFirebaseConfigReason =
  "missing_android_firebase_config: Add google-services.json and apply the Google services plugin for FCM.";
const simulatorNotSupportedReason =
  "simulator_not_supported: Expo push notifications require a physical device.";

const resolveErrorMessage = (error: unknown) => {
  if (!(error instanceof Error)) {
    return "";
  }

  return error.message.trim();
};

const resolveDevicePushTokenFailureReason = (
  platform: SupportedPushPlatform,
  error: unknown,
) => {
  const message = resolveErrorMessage(error);
  if (
    platform === "android" &&
    /firebase|google-services|fcm/i.test(message)
  ) {
    return missingAndroidFirebaseConfigReason;
  }

  return message || "device_push_token_failed";
};

const resolvePushRegistrationFailureReason = (error: unknown) => {
  const message = resolveErrorMessage(error);
  if (message.includes('No "projectId" found')) {
    return missingExpoProjectIdReason;
  }

  return message || "push_registration_failed";
};

const ensureNotificationHandler = () => {
  if (handlerConfigured) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  handlerConfigured = true;
};

const resolveSupportedPlatform = (): SupportedPushPlatform | null => {
  if (Platform.OS === "ios" || Platform.OS === "android") {
    return Platform.OS;
  }

  return null;
};

export async function registerForPushNotifications() {
  const platform = resolveSupportedPlatform();
  if (!platform) {
    return {
      token: null,
      platform: null,
      reason: "unsupported_platform",
    } as const;
  }

  if (!Device.isDevice) {
    return {
      token: null,
      platform,
      reason: simulatorNotSupportedReason,
    } as const;
  }

  ensureNotificationHandler();

  if (platform === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const currentPermissions = await Notifications.getPermissionsAsync();
  let status = currentPermissions.status;
  if (status !== "granted") {
    const requestedPermissions = await Notifications.requestPermissionsAsync();
    status = requestedPermissions.status;
  }

  if (status !== "granted") {
    return {
      token: null,
      platform,
      reason: "permission_denied",
    } as const;
  }

  let devicePushToken: Awaited<
    ReturnType<typeof Notifications.getDevicePushTokenAsync>
  >;
  try {
    devicePushToken = await Notifications.getDevicePushTokenAsync();
  } catch (error) {
    return {
      token: null,
      platform,
      reason: resolveDevicePushTokenFailureReason(platform, error),
    } as const;
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync(
      configuredExpoProjectId
        ? {
            projectId: configuredExpoProjectId,
            devicePushToken,
          }
        : {
            devicePushToken,
          },
    );
    return {
      token: token.data,
      platform,
      reason: null,
    } as const;
  } catch (error) {
    return {
      token: null,
      platform,
      reason: resolvePushRegistrationFailureReason(error),
    } as const;
  }
}
