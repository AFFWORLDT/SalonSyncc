import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:salonkit/app.dart';
import 'package:salonkit/auth_ui/salon_screen.dart';

import 'support/fake_adapter.dart';
import 'support/harness.dart';
import 'support/me_fixture.dart';

FakeAdapter salonApi() => FakeAdapter({
      'GET /api/public/brand': (o) => o.uri.host.startsWith('supersalon.') ? {'name': 'Super Salon', 'logo_url': null} : {'name': null, 'logo_url': null},
      'POST /api/mobile/session': (o) => (o.data as Map)['password'] == 'pass1234'
          ? {'token': 'skm_t', 'expires_at': 1}
          : const FakeReply(401, {'error': 'Wrong salon ID, username or password'}),
      'GET /api/me': (o) => fx('me_barber.json'),
    });

Future<void> start(WidgetTester t, {bool reduceMotion = false}) async {
  final a = putAuth(salonApi());
  await a.boot();
  await t.pumpWidget(MediaQuery(data: MediaQueryData(disableAnimations: reduceMotion), child: const SalonKitApp()));
  await t.pumpAndSettle();
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
    await t.tap(find.text('Continue'));
    await t.pumpAndSettle();
    expect(find.text('Sign in to Super Salon'), findsOneWidget);
    expect(find.text('Username'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
  });

  testWidgets('wrong password shows server text; right one signs in', (t) async {
    await start(t);
    await typeSalon(t, 'supersalon');
    await t.tap(find.text('Continue'));
    await t.pumpAndSettle();
    await t.enterText(find.widgetWithText(TextField, 'Username'), 'ali');
    await t.enterText(find.widgetWithText(TextField, 'Password'), 'nope');
    await t.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await t.pumpAndSettle();
    expect(find.text('Wrong salon ID, username or password'), findsOneWidget);
    await t.enterText(find.widgetWithText(TextField, 'Password'), 'pass1234');
    await t.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await t.pumpAndSettle();
    expect(find.text('Hi ali 👋'), findsOneWidget);
  });

  testWidgets('Not your salon? goes back to the ID screen', (t) async {
    await start(t);
    await typeSalon(t, 'supersalon');
    await t.tap(find.text('Continue'));
    await t.pumpAndSettle();
    await t.tap(find.text('Not your salon?'));
    await t.pumpAndSettle();
    expect(find.text('Enter your salon ID'), findsOneWidget);
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
