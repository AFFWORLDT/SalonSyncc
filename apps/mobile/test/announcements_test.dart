import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/auth/auth_controller.dart';
import 'package:salonkit/core/auth/device_info.dart';
import 'package:salonkit/core/auth/secure_store.dart';
import 'package:salonkit/core/auth/session_store.dart';
import 'package:salonkit/core/features/feature_module.dart';
import 'package:salonkit/core/features/registry.dart';
import 'package:salonkit/data/notices_api.dart';
import 'package:salonkit/models/role.dart';
import 'package:salonkit/modules/announcements/announcements_module.dart';
import 'package:salonkit/modules/announcements/announcements_screen.dart';
import 'package:salonkit/shell/shell.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fake_adapter.dart';
import 'support/me_fixture.dart';

Map<String, dynamic> raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync()) as Map<String, dynamic>;
ApiClient client(FakeAdapter a) => ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a);

void main() {
  tearDown(Get.reset);

  testWidgets('lists announcements, unread marked, then all marked read', (t) async {
    final unread = ValueNotifier(1);
    final a = FakeAdapter({'GET /api/notifications': (o) => raw('notifications.json'), 'POST /api/notifications/read': (o) => {'ok': true}});
    await t.pumpWidget(MaterialApp(home: Scaffold(body: AnnouncementsScreen(me: meWith(barber: true), api: NoticesApi(client(a)), unread: unread))));
    await t.pumpAndSettle();
    expect(find.text('Shop closes at 9 tonight'), findsOneWidget);
    expect(find.text('Please finish the last bills by 8:45.'), findsOneWidget);
    expect(find.byKey(const ValueKey('unread-9')), findsOneWidget);
    expect(a.calls.map((c) => '${c.method} ${c.path}'), ['GET /api/notifications', 'POST /api/notifications/read']);
    expect(unread.value, 0);
  });

  testWidgets('nothing yet', (t) async {
    final a = FakeAdapter({'GET /api/notifications': (o) => {'items': [], 'unread': 0}});
    await t.pumpWidget(MaterialApp(home: Scaffold(body: AnnouncementsScreen(me: meWith(barber: true), api: NoticesApi(client(a)), unread: ValueNotifier(0)))));
    await t.pumpAndSettle();
    expect(find.text('No announcements yet'), findsOneWidget);
    expect(a.calls.where((c) => c.method == 'POST'), isEmpty);
  });

  test('module needs the push switch and the barber role', () {
    expect(announcementsModule.visibleFor(meWith(barber: true)), isTrue);
    expect(announcementsModule.visibleFor(meWith(barber: true, features: ['core_sales'])), isFalse);
    expect(announcementsModule.visibleFor(meWith()), isFalse);
  });

  testWidgets('the More tab shows the unread count; the shell refreshes it on open', (t) async {
    SharedPreferences.setMockInitialValues({});
    final auth = Get.put(AuthController(
      store: SessionStore(MemorySecureStore()),
      device: const DeviceInfo(name: 'iPhone', platform: 'ios', appVersion: '1.0.0'),
      clientFor: (b, {token, onUnauthorized, onFeatureDisabled}) => client(FakeAdapter({})),
    ));
    auth.me.value = meWith(barber: true);
    final badge = ValueNotifier(0);
    var refreshed = 0;
    final registry = FeatureRegistry([
      FeatureModule(id: 'home', roles: {Role.barber}, title: 'Today', icon: Icons.today, tab: true, order: 0, builder: (_) => const Text('HOME')),
      FeatureModule(
        id: 'news',
        roles: {Role.barber},
        title: 'Announcements',
        icon: Icons.campaign,
        order: 5,
        badge: badge,
        onRefresh: () async {
          refreshed++;
          badge.value = 3;
        },
        builder: (_) => const Text('NEWS'),
      ),
    ]);
    await t.pumpWidget(GetMaterialApp(home: Shell(registry: registry)));
    await t.pumpAndSettle();
    expect(refreshed, 1);
    expect(find.text('3'), findsWidgets);
  });
}
