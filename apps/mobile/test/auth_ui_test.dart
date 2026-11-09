import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:salonkit/app.dart';
import 'package:salonkit/core/auth/auth_controller.dart';
import 'package:salonkit/auth_ui/salon_screen.dart';

import 'support/fake_adapter.dart';
import 'support/harness.dart';
import 'support/me_fixture.dart';

FakeAdapter salonApi() => FakeAdapter({
      'GET /api/public/brand': (o) => o.uri.host.startsWith('supersalon.') ? {'name': 'Super Salon', 'logo_url': null} : {'name': null, 'logo_url': null},
      'POST /api/auth/code': (o) => {'ok': true},
      'POST /api/auth/password/reset': (o) => (o.data as Map)['code'] == '123456' ? {'ok': true, 'slug': 'supersalon', 'username': 'ali'} : const FakeReply(401, {'error': 'That code is wrong or has expired'}),
      'POST /api/mobile/session': (o) => ['pass1234', 'newpass1'].contains((o.data as Map)['password']) || (o.data as Map)['code'] == '123456'
          ? {'token': 'skm_t', 'expires_at': 1}
          : const FakeReply(401, {'error': 'Wrong salon ID, username or password'}),
      'GET /api/me': (o) => fx('me_barber.json'),
    });

/// Opens the app signed out; it starts on "just your email", and [salonId] taps through to the salon ID screen.
Future<void> start(WidgetTester t, {bool reduceMotion = false, bool salonId = true}) async {
  final a = putAuth(salonApi());
  await a.boot();
  await t.pumpWidget(MediaQuery(data: MediaQueryData(disableAnimations: reduceMotion), child: const SalonKitApp()));
  await t.pumpAndSettle();
  if (salonId) {
    await t.ensureVisible(find.text('Use salon ID and password'));
    await t.tap(find.text('Use salon ID and password'));
    await t.pumpAndSettle();
  }
}

Future<void> typeSalon(WidgetTester t, String id) async {
  await t.enterText(find.byType(TextField), id);
  await t.pump(kSalonDebounce);
  await t.pumpAndSettle();
}

void main() {
  tearDown(Get.reset);

  testWidgets('signing out from a screen opened on top goes back to sign-in (nothing left above it)', (t) async {
    final a = putAuth(salonApi());
    await t.runAsync(() async {
      await a.chooseSalon(const SavedSalonForTest().salon);
      await a.signIn('ali', 'pass1234');
      await a.boot();
    });
    await t.pumpWidget(const SalonKitApp());
    // The signed-in home keeps loading skeletons pulsing, so step time instead of waiting to settle.
    Future<void> step() async {
      for (var i = 0; i < 10; i++) {
        await t.pump(const Duration(milliseconds: 100));
      }
    }

    await step();
    Get.to<void>(() => const Scaffold(body: Text('PUSHED PAGE')));
    await step();
    expect(find.text('PUSHED PAGE'), findsOneWidget);
    await t.runAsync(a.signOut);
    await step();
    expect(find.text('PUSHED PAGE'), findsNothing);
    expect(find.text('Sign in to Super Salon'), findsOneWidget);
  });

  testWidgets('typing an ID shows the salon after debounce', (t) async {
    await start(t);
    expect(find.text('Enter your salon ID'), findsOneWidget);
    await t.enterText(find.byType(TextField), 'supersalon');
    await t.pump(const Duration(milliseconds: 100));
    expect(find.text('Super Salon'), findsNothing);
    await t.pump(kSalonDebounce);
    await t.pumpAndSettle();
    expect(find.text('Super Salon'), findsOneWidget);
    expect(find.text('Continue'), findsOneWidget);
  });

  testWidgets('unknown ID shows not-found text', (t) async {
    await start(t);
    await typeSalon(t, 'nosuchsalon');
    expect(find.text("We couldn't find that salon. Check the ID with your salon owner."), findsOneWidget);
    expect(find.text('Continue'), findsNothing);
  });

  testWidgets('Continue opens sign-in branded with the salon', (t) async {
    await start(t);
    await typeSalon(t, 'Super Salon'.replaceAll(' ', '')); // "SuperSalon" normalizes to supersalon
    await t.ensureVisible(find.text('Continue'));
    await t.tap(find.text('Continue'));
    await t.pumpAndSettle();
    expect(find.text('Sign in to Super Salon'), findsOneWidget);
    expect(find.text('Email or username'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
  });

  testWidgets('wrong password shows server text; right one signs in', (t) async {
    await start(t);
    await typeSalon(t, 'supersalon');
    await t.ensureVisible(find.text('Continue'));
    await t.tap(find.text('Continue'));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const ValueKey('login-user')), 'ali');
    await t.enterText(find.byKey(const ValueKey('login-pass')), 'nope');
    await t.ensureVisible(find.widgetWithText(FilledButton, 'Sign in'));
    await t.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await t.pumpAndSettle();
    expect(find.text('Wrong salon ID, username or password'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('login-pass')), 'pass1234');
    await t.ensureVisible(find.widgetWithText(FilledButton, 'Sign in'));
    await t.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await t.pumpAndSettle();
    expect(find.text('Hi ali 👋'), findsOneWidget);
  });

  testWidgets('sign in with an email code: email, Email me a code, then the 6 digits', (t) async {
    final a = salonApi();
    putAuth(a);
    await Get.find<AuthController>().boot();
    await t.pumpWidget(const SalonKitApp());
    await t.pumpAndSettle();
    await t.ensureVisible(find.text('Use salon ID and password'));
    await t.tap(find.text('Use salon ID and password'));
    await t.pumpAndSettle();
    await typeSalon(t, 'supersalon');
    await t.ensureVisible(find.text('Continue'));
    await t.tap(find.text('Continue'));
    await t.pumpAndSettle();
    await t.ensureVisible(find.text('Sign in with an email code instead'));
    await t.tap(find.text('Sign in with an email code instead'));
    await t.pumpAndSettle();
    expect(find.text('Password'), findsNothing);
    await t.enterText(find.byKey(const ValueKey('login-email')), 'ali@mail.com');
    await t.ensureVisible(find.widgetWithText(FilledButton, 'Email me a code'));
    await t.tap(find.widgetWithText(FilledButton, 'Email me a code'));
    await t.pumpAndSettle();
    expect(a.calls.where((c) => c.path == '/api/auth/code').single.data, {'email': 'ali@mail.com'});
    expect(find.textContaining('a 6-digit code is on its way'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('login-code')), '123 456');
    await t.ensureVisible(find.widgetWithText(FilledButton, 'Sign in'));
    await t.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await t.pumpAndSettle();
    final session = a.calls.where((c) => c.path == '/api/mobile/session').single.data as Map;
    expect([session['email'], session['code'], session.containsKey('password')], ['ali@mail.com', '123456', false]);
    expect(find.text('Hi ali 👋'), findsOneWidget);
  });

  testWidgets('forgot password: code to the email, new password, signed in with it', (t) async {
    final a = salonApi();
    putAuth(a);
    await Get.find<AuthController>().boot();
    await t.pumpWidget(const SalonKitApp());
    await t.pumpAndSettle();
    await t.ensureVisible(find.text('Use salon ID and password'));
    await t.tap(find.text('Use salon ID and password'));
    await t.pumpAndSettle();
    await typeSalon(t, 'supersalon');
    await t.ensureVisible(find.text('Continue'));
    await t.tap(find.text('Continue'));
    await t.pumpAndSettle();
    await t.ensureVisible(find.byKey(const ValueKey('login-forgot')));
    await t.tap(find.byKey(const ValueKey('login-forgot')));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const ValueKey('fp-email')), 'ali@mail.com');
    await t.ensureVisible(find.widgetWithText(FilledButton, 'Email me a code'));
    await t.tap(find.widgetWithText(FilledButton, 'Email me a code'));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const ValueKey('fp-code')), '123456');
    await t.enterText(find.byKey(const ValueKey('fp-pass')), 'newpass1');
    await t.ensureVisible(find.widgetWithText(FilledButton, 'Save and sign in'));
    await t.tap(find.widgetWithText(FilledButton, 'Save and sign in'));
    await t.pumpAndSettle();
    final reset = a.calls.singleWhere((c) => c.path == '/api/auth/password/reset').data as Map;
    expect([reset['email'], reset['code'], reset['password']], ['ali@mail.com', '123456', 'newpass1']);
    final login = a.calls.lastWhere((c) => c.path == '/api/mobile/session').data as Map;
    expect([login['username'], login['password']], ['ali', 'newpass1']);
    expect(find.text('Hi ali 👋'), findsOneWidget);
  });

  testWidgets('Not your salon? goes back to the first screen (just your email)', (t) async {
    await start(t);
    await typeSalon(t, 'supersalon');
    await t.ensureVisible(find.text('Continue'));
    await t.tap(find.text('Continue'));
    await t.pumpAndSettle();
    await t.ensureVisible(find.text('Not your salon? Choose another'));
    await t.tap(find.text('Not your salon? Choose another'));
    await t.pumpAndSettle();
    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Use salon ID and password'), findsOneWidget);
  });

  testWidgets('reduce motion: the salon appears without animating', (t) async {
    await start(t, reduceMotion: true);
    await t.enterText(find.byType(TextField), 'supersalon');
    await t.pump(kSalonDebounce);
    await t.pump();
    await t.pump();
    final reveal = t.widget<AnimatedSwitcher>(find.byKey(const Key('salon-reveal')));
    expect(reveal.duration, Duration.zero);
    expect(find.text('Super Salon'), findsOneWidget);
  });
}
