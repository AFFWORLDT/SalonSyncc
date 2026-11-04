import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/version/update_gate.dart';
import 'package:salonkit/core/version/version_check.dart';
import 'package:salonkit/models/app_config.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../support/fake_adapter.dart';

const cfg = AppConfig(minVersion: '1.2.0', latestVersion: '1.4.0', storeUrl: 'https://apps.apple.com/app/salonkit');

UpdateController make(Map<String, Handler> routes, String current) => Get.put(UpdateController(
      api: ApiClient(Uri.parse('https://admin.salonkit.online'), adapter: FakeAdapter(routes)),
      platform: 'ios',
      currentVersion: current,
    ));

Map<String, Handler> serves(AppConfig c) => {
      'GET /api/public/app-config': (o) => {'min_version': c.minVersion, 'latest_version': c.latestVersion, 'store_url': c.storeUrl},
    };

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  tearDown(Get.reset);

  test('compareVersions numeric', () {
    expect(compareVersions('1.10.0', '1.9.0'), greaterThan(0));
    expect(compareVersions('1.0.0', '1.0.0'), 0);
    expect(compareVersions('1.0', '1.0.1'), lessThan(0));
  });

  test('needFor required/optional/none', () {
    expect(needFor('1.1.9', cfg), UpdateNeed.required);
    expect(needFor('1.2.0', cfg), UpdateNeed.optional);
    expect(needFor('1.4.0', cfg), UpdateNeed.none);
    expect(needFor('2.0.0', cfg), UpdateNeed.none);
  });

  testWidgets('required shows the blocking screen', (t) async {
    final u = make(serves(cfg), '1.0.0');
    await t.runAsync(u.check);
    await t.pumpWidget(const MaterialApp(home: UpdateGate(child: Scaffold(body: Text('APP')))));
    await t.pumpAndSettle();
    expect(find.text('Update SalonKit'), findsOneWidget);
    expect(find.text('This version is no longer supported. Update to keep using SalonKit.'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Update'), findsOneWidget);
  });

  testWidgets('optional shows a dismissible banner, once per latest version', (t) async {
    final u = make(serves(cfg), '1.3.0');
    await t.runAsync(u.check);
    await t.pumpWidget(const MaterialApp(home: UpdateGate(child: Scaffold(body: Text('APP')))));
    await t.pumpAndSettle();
    expect(find.text('APP'), findsOneWidget);
    expect(find.text('A new version of SalonKit is available'), findsOneWidget);
    await t.tap(find.text('Not now'));
    await t.pumpAndSettle();
    expect(find.text('A new version of SalonKit is available'), findsNothing);
    await t.runAsync(u.check);
    await t.pumpAndSettle();
    expect(find.text('A new version of SalonKit is available'), findsNothing);
  });

  testWidgets('failed check continues to the app', (t) async {
    final u = make({'GET /api/public/app-config': (o) => throw offline(o)}, '1.0.0');
    await t.runAsync(u.check);
    await t.pumpWidget(const MaterialApp(home: UpdateGate(child: Scaffold(body: Text('APP')))));
    await t.pumpAndSettle();
    expect(find.text('APP'), findsOneWidget);
    expect(u.need.value, UpdateNeed.none);
  });
}
