import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:salonkit/app.dart';
import 'package:salonkit/core/auth/auth_controller.dart';
import 'package:salonkit/core/auth/link_handler.dart';

import 'support/fake_adapter.dart';
import 'support/harness.dart';
import 'support/me_fixture.dart';

/// Root host (salonkit.online) answers the email-only calls; the salon's host answers brand and me.
FakeAdapter api({bool goodCode = true}) => FakeAdapter({
      'POST /api/auth/code': (o) => {'ok': true},
      'POST /api/mobile/session': (o) => goodCode && (o.data as Map)['code'] == '123456'
          ? {'token': 'skm_t', 'expires_at': 1, 'slug': 'supersalon'}
          : const FakeReply(401, {'error': 'That code is wrong or has expired'}),
      'POST /api/public/signup': (o) => const FakeReply(201, {'slug': 'newcuts', 'token': 'skm_n', 'expires_at': 1}),
      'GET /api/public/slug': (o) => {'slug': o.queryParameters['s'], 'available': o.queryParameters['s'] != 'taken-id'},
      'GET /api/public/brand': (o) => {'name': o.uri.host.startsWith('newcuts.') ? 'New Cuts' : 'Super Salon', 'logo_url': null},
      'GET /api/me': (o) => fx('me_barber.json'),
    });

Future<FakeAdapter> open(WidgetTester t, {bool goodCode = true}) async {
  final a = api(goodCode: goodCode);
  await putAuth(a).boot();
  await t.pumpWidget(const SalonKitApp());
  await t.pumpAndSettle();
  return a;
}

void main() {
  tearDown(Get.reset);

  testWidgets('just your email: code from the bare domain; the server names the salon', (t) async {
    final a = await open(t);
    expect(find.text('Sign in to your salon'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('start-email')), 'ali@mail.com');
    await t.tap(find.widgetWithText(FilledButton, 'Continue'));
    await t.pumpAndSettle();
    final ask = a.calls.singleWhere((c) => c.path == '/api/auth/code');
    expect([ask.uri.host, ask.data], ['salonkit.online', {'email': 'ali@mail.com'}]);
    expect(find.text('Check your email'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('start-code')), '123456');
    await t.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await t.pumpAndSettle();
    final s = a.calls.singleWhere((c) => c.path == '/api/mobile/session');
    expect(s.uri.host, 'salonkit.online');
    expect(Get.find<AuthController>().salon.value!.name, 'Super Salon');
    expect(find.text('Hi ali 👋'), findsOneWidget);
  });

  testWidgets('a tapped link signs in on the salon named by its host', (t) async {
    final a = await open(t);
    final done = LinkHandler(Get.find<AuthController>()).handle(Uri.parse('https://supersalon.salonkit.online/l/?e=ali%40mail.com&c=123456'));
    await t.pumpAndSettle();
    expect(await done, isTrue);
    final s = a.calls.singleWhere((c) => c.path == '/api/mobile/session');
    expect(s.uri.host, 'supersalon.salonkit.online');
    expect((s.data as Map)['email'], 'ali@mail.com');
    expect(find.text('Hi ali 👋'), findsOneWidget);
  });

  testWidgets('an expired link says so on the first screen; other links are ignored', (t) async {
    await open(t, goodCode: false);
    final h = LinkHandler(Get.find<AuthController>());
    expect(await h.handle(Uri.parse('https://supersalon.salonkit.online/login/')), isFalse);
    final done = h.handle(Uri.parse('https://supersalon.salonkit.online/l/?e=ali%40mail.com&c=999999'));
    await t.pumpAndSettle();
    expect(await done, isTrue);
    expect(find.textContaining('expired or was already used'), findsOneWidget);
  });

  testWidgets('new salon: free trial from the app, signed in as its owner', (t) async {
    final a = await open(t);
    await t.tap(find.byKey(const ValueKey('start-trial')));
    await t.pumpAndSettle();
    expect(find.text('Start your free trial'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('su-salon')), 'New Cuts');
    await t.enterText(find.byKey(const ValueKey('su-name')), 'Nina Owner');
    await t.enterText(find.byKey(const ValueKey('su-email')), 'nina@cuts.com');
    await t.pump(const Duration(milliseconds: 500));
    await t.pumpAndSettle();
    expect(find.text('newcuts.salonkit.online is yours'), findsNothing); // "new-cuts" is the suggestion
    expect(find.text('new-cuts.salonkit.online is yours'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('su-pass')), 'longpass1');
    await t.ensureVisible(find.widgetWithText(FilledButton, 'Start free trial'));
    await t.tap(find.widgetWithText(FilledButton, 'Start free trial'));
    await t.pumpAndSettle();
    final su = a.calls.singleWhere((c) => c.path == '/api/public/signup');
    final body = su.data as Map;
    expect(su.uri.host, 'salonkit.online');
    expect([body['salon_name'], body['owner_name'], body['email'], body['slug'], body['password']], ['New Cuts', 'Nina Owner', 'nina@cuts.com', 'new-cuts', 'longpass1']);
    expect((body['device'] as Map)['platform'], 'ios');
    expect(Get.find<AuthController>().salon.value!.slug, 'newcuts');
    expect(Get.find<AuthController>().state.value, AuthState.signedIn);
  });

  testWidgets('a taken salon ID is shown before submitting', (t) async {
    await open(t);
    await t.tap(find.byKey(const ValueKey('start-trial')));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const ValueKey('su-slug')), 'taken-id');
    await t.pump(const Duration(milliseconds: 500));
    await t.pumpAndSettle();
    expect(find.text('That salon ID is taken'), findsOneWidget);
  });
}
