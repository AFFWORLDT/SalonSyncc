import 'dart:async';

import 'package:flutter/material.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:get/get.dart';

import 'app.dart';
import 'core/api/api_client.dart';
import 'core/auth/auth_controller.dart';
import 'core/auth/device_info.dart';
import 'core/auth/secure_store.dart';
import 'core/auth/session_store.dart';
import 'core/config.dart';
import 'core/connectivity/connectivity_controller.dart';
import 'core/connectivity/offline_bar.dart';
import 'core/theme/theme_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final theme = Get.put(ThemeController());
  final device = await DeviceInfo.current();
  final ua = 'SalonKit/${device.appVersion} (${device.platform})';
  final auth = Get.put(AuthController(
    store: SessionStore(const FlutterSecureStore()),
    device: device,
    clientFor: (base, {token, onUnauthorized, onFeatureDisabled}) =>
        ApiClient(base, token: token, onUnauthorized: onUnauthorized, onFeatureDisabled: onFeatureDisabled, userAgent: ua),
  ));
  // Online again only once the API answers (the phone can report Wi-Fi with no internet behind it).
  Get.put(ConnectivityController(
    changes: Connectivity().onConnectivityChanged.map((r) => r.any((x) => x != ConnectivityResult.none)),
    ping: () async {
      final s = auth.salon.value;
      final c = ApiClient(s == null ? configBase() : salonBase(s.slug), userAgent: ua);
      return c.get('/api/health', (j) => j is Map && j['ok'] == true).catchError((_) => false);
    },
  ));
  appWrappers.add((context, child) => OfflineBar(child: child));
  await theme.load();
  runApp(const SalonKitApp());
  // The splash stays at least 400 ms so it never flashes.
  await auth.boot(hold: Future<void>.delayed(const Duration(milliseconds: 400)));
}
