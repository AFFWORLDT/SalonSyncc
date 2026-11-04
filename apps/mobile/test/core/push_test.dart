import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:salonkit/core/features/feature_module.dart';
import 'package:salonkit/core/features/registry.dart';
import 'package:salonkit/core/push/deep_link.dart';
import 'package:salonkit/core/push/push_service.dart';
import 'package:salonkit/models/role.dart';

import '../support/fake_adapter.dart';
import '../support/harness.dart';
import '../support/me_fixture.dart';

class FakePushPlatform implements PushPlatform {
  int asks = 0;
  int deletes = 0;
  final refresh = StreamController<String>.broadcast();
  @override
  Future<bool> requestPermission() async {
    asks++;
    return true;
  }

  @override
  Future<String?> token() async => 'fcm-token-aaaaaaaaaaaaaaaaaaaaaaaa';
  @override
  Stream<String> get onTokenRefresh => refresh.stream;
  @override
  Future<void> deleteToken() async => deletes++;
}

const all = {Role.admin, Role.barber};
FeatureModule m(String id, String? key) => FeatureModule(id: id, featureKey: key, roles: all, title: id, icon: Icons.circle, builder: (_) => Text(id));
final registry = FeatureRegistry([m('home', null), m('sales', null), m('history', null), m('announcements', 'announcements')]);

void main() {
  tearDown(Get.reset);

  test('no push feature → no permission ask, no token post', () async {
    final a = FakeAdapter({'POST /api/push/tokens': (o) => {'ok': true}});
    final auth = putAuth(a);
    final p = FakePushPlatform();
    final s = PushService(platform: p, auth: auth);
    await s.onSignedIn(meWith(features: ['core_sales']));
    expect(p.asks, 0);
    expect(a.calls, isEmpty);
  });

  test('push on → token posted once, again on refresh', () async {
    final a = FakeAdapter({'POST /api/push/tokens': (o) => {'ok': true}});
    final auth = putAuth(a);
    await auth.chooseSalon(const SavedSalonForTest().salon);
    final p = FakePushPlatform();
    final s = PushService(platform: p, auth: auth);
    final me = meWith(features: ['core_sales', 'push']);
    await s.onSignedIn(me);
    await s.onSignedIn(me);
    expect(p.asks, 1);
    expect(a.calls.where((o) => o.uri.path == '/api/push/tokens'), hasLength(1));
    expect((a.calls.single.data as Map)['token'], 'fcm-token-aaaaaaaaaaaaaaaaaaaaaaaa');
    p.refresh.add('fcm-token-bbbbbbbbbbbbbbbbbbbbbbbb');
    await pumpEventQueue();
    expect(a.calls, hasLength(2));
    await s.onSignedOut();
    expect(p.deletes, 1);
  });

  test('routeForPush maps server paths and falls back to home when off', () {
    final on = meWith(features: ['core_sales', 'announcements']);
    final off = meWith(features: ['core_sales']);
    expect(routeForPush({'path': '/sales/'}, registry, on), 'sales');
    expect(routeForPush({'path': '/history/'}, registry, on), 'history');
    expect(routeForPush({'path': '/announcements'}, registry, on), 'announcements');
    expect(routeForPush({'path': '/announcements'}, registry, off), 'home');
    expect(routeForPush({'path': '/'}, registry, on), 'home');
    expect(routeForPush({'link': 'https://s.salonkit.online/history/'}, registry, on), 'history');
    expect(routeForPush({'path': '/nope'}, registry, on), 'home');
    expect(routeForPush({}, registry, on), 'home');
  });
}
