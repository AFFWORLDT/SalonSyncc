import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/auth/auth_controller.dart';
import 'package:salonkit/core/auth/device_info.dart';
import 'package:salonkit/core/auth/secure_store.dart';
import 'package:salonkit/core/auth/session_store.dart';
import 'package:salonkit/core/features/feature_gate.dart';
import 'package:salonkit/core/features/feature_module.dart';
import 'package:salonkit/core/features/registry.dart';
import 'package:salonkit/core/push/deep_link.dart';
import 'package:salonkit/core/theme/theme_controller.dart';
import 'package:salonkit/models/role.dart';
import 'package:salonkit/shell/shell.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fake_adapter.dart';
import 'support/me_fixture.dart';

const all = {Role.admin, Role.barber};
final registry = FeatureRegistry([
  FeatureModule(id: 'home', roles: all, title: 'Today', icon: Icons.home, tab: true, order: 0, builder: (_) => const Text('HOME BODY')),
  FeatureModule(id: 'ledger', featureKey: 'ledger', roles: all, title: 'Ledger', icon: Icons.book, tab: true, order: 1, builder: (_) => const Text('LEDGER BODY')),
  FeatureModule(id: 'audit', featureKey: 'audit_log', roles: {Role.admin}, title: 'Audit log', icon: Icons.history, order: 2, builder: (_) => const Text('AUDIT BODY')),
]);

AuthController auth() {
  SharedPreferences.setMockInitialValues({});
  final c = AuthController(
    store: SessionStore(MemorySecureStore()),
    device: const DeviceInfo(name: 'iPhone', platform: 'ios', appVersion: '1.0.0'),
    clientFor: (b, {token, onUnauthorized, onFeatureDisabled}) => ApiClient(b, adapter: FakeAdapter({})),
  );
  return Get.put(c);
}

Widget app() => GetMaterialApp(home: Shell(registry: registry));

void main() {
  tearDown(Get.reset);

  testWidgets('builds tabs from the switches; the rest is in the profile', (t) async {
    auth().me.value = meWith(features: ['core_sales', 'ledger', 'audit_log']);
    Get.put(ThemeController());
    await t.pumpWidget(app());
    expect(find.text('HOME BODY'), findsOneWidget);
    expect(find.text('Ledger'), findsOneWidget);
    expect(find.text('More'), findsNothing);
    await t.tap(find.byKey(const ValueKey('top-profile')));
    // The profile banner drifts forever, so wait for the page instead of for "settled".
    await t.pump();
    await t.pump(const Duration(milliseconds: 400));
    await t.dragUntilVisible(find.text('Audit log'), find.byType(ListView).last, const Offset(0, -200));
    expect(find.text('Audit log'), findsOneWidget);
  });

  testWidgets('switch turned off while open returns to home with message', (t) async {
    final a = auth()..me.value = meWith(features: ['core_sales', 'ledger']);
    await t.pumpWidget(app());
    await t.tap(find.text('Ledger'));
    await t.pumpAndSettle();
    expect(find.text('LEDGER BODY'), findsOneWidget);
    a.me.value = meWith(features: ['core_sales']);
    await t.pumpAndSettle();
    expect(find.text('HOME BODY'), findsOneWidget);
    expect(find.text('That feature was switched off for your salon'), findsOneWidget);
  });

  testWidgets('FeatureGate shows the off message for a hidden module', (t) async {
    auth().me.value = meWith(barber: true, features: ['core_sales', 'audit_log']);
    await t.pumpWidget(GetMaterialApp(home: FeatureGate(registry: registry, id: 'audit')));
    expect(find.text("This feature isn't on for your salon"), findsOneWidget);
    expect(find.text('AUDIT BODY'), findsNothing);
  });

  testWidgets('opening a tab from a screen on top closes that screen first', (t) async {
    auth().me.value = meWith(features: ['core_sales', 'ledger', 'audit_log']);
    await t.pumpWidget(app());
    pendingRoute.value = 'audit';
    await t.pumpAndSettle();
    expect(find.text('AUDIT BODY'), findsOneWidget);
    pendingRoute.value = 'ledger';
    await t.pumpAndSettle();
    expect(find.text('AUDIT BODY'), findsNothing);
    expect(find.text('LEDGER BODY'), findsOneWidget);
  });

  testWidgets('a tapped notification opens its tab or its More screen', (t) async {
    auth().me.value = meWith(features: ['core_sales', 'ledger', 'audit_log']);
    await t.pumpWidget(app());
    pendingRoute.value = 'ledger';
    await t.pumpAndSettle();
    expect(find.text('LEDGER BODY'), findsOneWidget);
    expect(pendingRoute.value, isNull);
    pendingRoute.value = 'audit';
    await t.pumpAndSettle();
    expect(find.text('AUDIT BODY'), findsOneWidget);
  });
}
