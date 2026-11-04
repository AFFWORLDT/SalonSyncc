import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:get/get.dart';

import '../auth/auth_controller.dart';
import '../features/registry.dart';
import 'deep_link.dart';
import 'push_service.dart';

/// Taps on notifications open their screen; pushes that arrive while the app is open show as a local notification.
/// Only called when Firebase started (its config files are present).
Future<PushService> setUpPush(AuthController auth, FeatureRegistry registry) async {
  final push = PushService(platform: FirebasePushPlatform(), auth: auth);
  auth.pushToken = () => push.currentToken;
  auth.afterSignOut = push.onSignedOut;

  void openFrom(Map<String, dynamic> data) {
    final me = auth.me.value;
    if (me != null) pendingRoute.value = routeForPush(data, registry, me);
  }

  final local = FlutterLocalNotificationsPlugin();
  await local.initialize(
    const InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(requestAlertPermission: false, requestBadgePermission: false, requestSoundPermission: false),
    ),
    onDidReceiveNotificationResponse: (r) => openFrom({'path': r.payload}),
  );
  const channel = AndroidNotificationDetails('salon', 'Salon updates', importance: Importance.high, priority: Priority.high);

  FirebaseMessaging.onMessage.listen((m) {
    pushArrived.value++;
    final n = m.notification;
    if (n == null) return;
    local.show(m.hashCode, n.title, n.body, const NotificationDetails(android: channel, iOS: DarwinNotificationDetails()),
        payload: m.data['path'] as String?);
  });
  FirebaseMessaging.onMessageOpenedApp.listen((m) => openFrom(m.data));
  final first = await FirebaseMessaging.instance.getInitialMessage();
  if (first != null) {
    // Opened from a notification while closed: open it once signed in.
    once(auth.me, (_) => openFrom(first.data), condition: () => auth.me.value != null);
    if (auth.me.value != null) openFrom(first.data);
  }
  return push;
}
