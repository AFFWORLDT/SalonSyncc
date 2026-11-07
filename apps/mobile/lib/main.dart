import 'dart:async';

import 'package:flutter/material.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

import 'app.dart';
import 'auth_ui/lock_gate.dart';
import 'core/auth/biometric_service.dart';
import 'core/auth/lock_controller.dart';
import 'modules/account/account_module.dart';
import 'modules/modules.dart';
import 'shell/shell.dart';
import 'core/api/api_client.dart';
import 'core/auth/auth_controller.dart';
import 'core/auth/device_info.dart';
import 'core/auth/secure_store.dart';
import 'core/auth/session_store.dart';
import 'core/config.dart';
import 'core/features/registry.dart';
import 'core/push/push_setup.dart';
import 'core/connectivity/connectivity_controller.dart';
import 'core/connectivity/offline_bar.dart';
import 'core/theme/theme_controller.dart';
import 'core/version/update_gate.dart';
import 'core/version/version_check.dart';

Future<void> main() => run();

/// [crashReports] off in the e2e tests: the test runner owns FlutterError.onError.
Future<void> run({bool crashReports = true}) async {
  WidgetsFlutterBinding.ensureInitialized();
  // Firebase (push + crash reports) needs google-services.json / GoogleService-Info.plist. Without them the app runs
  // with both off; it must never fail to start over it.
  var firebase = false;
  try {
    await Firebase.initializeApp();
    firebase = true;
    if (crashReports) {
      FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
      PlatformDispatcher.instance.onError = (e, st) {
        FirebaseCrashlytics.instance.recordError(e, st, fatal: true);
        return true;
      };
    }
  } catch (e) {
    debugPrint('Firebase off: $e');
  }
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
  final lock = Get.put(LockController(LocalAuthBiometrics()));
  appWrappers.add((context, child) => LockGate(child: child));
  final update = Get.put(UpdateController(api: ApiClient(configBase(), userAgent: ua), platform: device.platform, currentVersion: device.appVersion));
  appWrappers.add((context, child) => UpdateGate(child: child));
  registerLockToggle();
  postSignInSteps.add(offerBiometricLock);
  final registry = FeatureRegistry(appModules);
  if (firebase) {
    final push = await setUpPush(auth, registry);
    postSignInSteps.add((_) async {
      final me = auth.me.value;
      if (me == null) return;
      // Crash reports name the salon and user id only (never the token or request headers).
      FirebaseCrashlytics.instance.setUserIdentifier('${me.org.slug}:${me.user.id}').ignore();
      await push.onSignedIn(me);
    });
  }
  await Future.wait([theme.load(), lock.load()]);
  runApp(SalonKitApp(registry: registry, intro: crashReports));
  // The splash stays until the version check is back, and at least 400 ms so it never flashes.
  await auth.boot(hold: Future.wait([update.check(), Future<void>.delayed(const Duration(milliseconds: 400))]));
}
