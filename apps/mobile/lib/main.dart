import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'app.dart';
import 'core/api/api_client.dart';
import 'core/auth/auth_controller.dart';
import 'core/auth/device_info.dart';
import 'core/auth/secure_store.dart';
import 'core/auth/session_store.dart';
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
  await theme.load();
  runApp(const SalonKitApp());
  // The splash stays at least 400 ms so it never flashes.
  await auth.boot(hold: Future<void>.delayed(const Duration(milliseconds: 400)));
}
