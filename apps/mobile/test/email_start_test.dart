import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:salonkit/app.dart';
import 'package:salonkit/core/auth/auth_controller.dart';
import 'package:salonkit/core/auth/link_handler.dart';
import 'package:salonkit/core/auth/social_auth.dart';
import 'package:salonkit/auth_ui/signup_screen.dart' show flagOf;
import 'package:salonkit/auth_ui/salon_screen.dart' show kSalonDebounce;

import 'support/fake_adapter.dart';
import 'support/harness.dart';
import 'support/me_fixture.dart';

/// Root host (salonkit.online) answers the email-only calls; the salon's host answers brand and me.
FakeAdapter api({bool goodCode = true}) => FakeAdapter({
      'POST /api/auth/code': (o) => {'ok': true},
      'POST /api/auth/social': (o) => (o.data as Map)['id_token'] == 'tok-known'
          ? {'token': 'skm_s', 'expires_at': 1, 'slug': 'supersalon'}
          : {'new': true, 'email': 'nina@gmail.com', 'name': 'Nina New'},
      'POST /api/mobile/session': (o) => goodCode && (o.data as Map)['code'] == '123456'
          ? {'token': 'skm_t', 'expires_at': 1, 'slug': 'supersalon'}
          : const FakeReply(401, {'error': 'That code is wrong or has expired'}),
      'POST /api/public/signup': (o) => const FakeReply(201, {'slug': 'newcuts', 'token': 'skm_n', 'expires_at': 1}),
      'GET /api/public/slug': (o) => {'slug': o.queryParameters['s'], 'available': o.queryParameters['s'] != 'taken-id'},
      'GET /api/public/brand': (o) => {'name': o.uri.host.startsWith('newcuts.') ? 'New Cuts' : 'Super Salon', 'logo_url': null},
      'GET /api/me': (o) => fx('me_barber.json'),
    });

class FakeSocial implements SocialAuth {
  FakeSocial({this.token, this.error, this.hasApple = false});
  final String? token;
  final String? error;
  final bool hasApple;
  int sheets = 0;
  Future<String?> _go() async {
    sheets++;
    if (error != null) throw SocialAuthError(error!);
    return token;
  }

  @override
  Future<String?> google() => _go();
  @override
  Future<String?> apple() => _go();
  @override
  bool get appleAvailable => hasApple;
}

Future<FakeAdapter> open(WidgetTester t, {bool goodCode = true, SocialAuth? social}) async {
  final a = api(goodCode: goodCode);
  if (social != null) Get.put<SocialAuth>(social);
  await putAuth(a).boot();
  await t.pumpWidget(const SalonKitApp());
  await t.pumpAndSettle();
  return a;
}

void main() {
  tearDown(Get.reset);

  testWidgets('just your email: code from the bare domain; the server names the salon', (t) async {
    final a = await open(t);
    expect(find.text('Welcome back'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('start-email')), 'ali@mail.com');
    await t.ensureVisible(find.widgetWithText(FilledButton, 'Email me a sign-in code'));
    await t.tap(find.widgetWithText(FilledButton, 'Email me a sign-in code'));
    await t.pumpAndSettle();
    final ask = a.calls.singleWhere((c) => c.path == '/api/auth/code');
    expect([ask.uri.host, ask.data], ['salonkit.online', {'email': 'ali@mail.com'}]);
    expect(find.text('Check your email'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('start-code')), '123456');
    FocusManager.instance.primaryFocus?.unfocus(); // the code field's cursor handle hangs over the button
    await t.pumpAndSettle();
    await t.ensureVisible(find.widgetWithText(FilledButton, 'Sign in'));
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
    await t.ensureVisible(find.byKey(const ValueKey('start-trial')));
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
    await t.ensureVisible(find.byKey(const ValueKey('start-trial')));
    await t.tap(find.byKey(const ValueKey('start-trial')));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const ValueKey('su-slug')), 'taken-id');
    await t.pump(const Duration(milliseconds: 500));
    await t.pumpAndSettle();
    expect(find.text('That salon ID is taken'), findsOneWidget);
  });

  testWidgets('no Firebase: only the email way', (t) async {
    await open(t);
    expect(find.byKey(const ValueKey('start-google')), findsNothing);
  });

  testWidgets('Android: Google, no Apple', (t) async {
    await open(t, social: FakeSocial(hasApple: false));
    expect(find.byKey(const ValueKey('start-google')), findsOneWidget);
    expect(find.byKey(const ValueKey('start-apple')), findsNothing);
  });

  testWidgets('iPhone: Google and Apple', (t) async {
    await open(t, social: FakeSocial(hasApple: true));
    expect(find.byKey(const ValueKey('start-apple')), findsOneWidget);
  });

  testWidgets('Google, email on a team: signed in to that salon', (t) async {
    final a = await open(t, social: FakeSocial(token: 'tok-known'));
    await t.ensureVisible(find.byKey(const ValueKey('start-google')));
    await t.tap(find.byKey(const ValueKey('start-google')));
    await t.pumpAndSettle();
    final call = a.calls.singleWhere((c) => c.path == '/api/auth/social');
    expect([call.uri.host, (call.data as Map)['id_token']], ['salonkit.online', 'tok-known']);
    expect(find.text('Hi ali 👋'), findsOneWidget);
  });

  testWidgets('Google, new email: sign-up without email or password, then setup opens', (t) async {
    final a = await open(t, social: FakeSocial(token: 'tok-new'));
    await t.ensureVisible(find.byKey(const ValueKey('start-google')));
    await t.tap(find.byKey(const ValueKey('start-google')));
    await t.pumpAndSettle();
    expect(find.textContaining('Signed in as nina@gmail.com'), findsOneWidget);
    expect(find.byKey(const ValueKey('su-email')), findsNothing);
    expect(find.byKey(const ValueKey('su-pass')), findsNothing);
    expect(find.widgetWithText(TextField, 'Nina New'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('su-salon')), 'New Cuts');
    await t.pump(const Duration(milliseconds: 500));
    await t.pumpAndSettle();
    await t.ensureVisible(find.widgetWithText(FilledButton, 'Start free trial'));
    await t.tap(find.widgetWithText(FilledButton, 'Start free trial'));
    await t.pumpAndSettle();
    final body = a.calls.singleWhere((c) => c.path == '/api/public/signup').data as Map;
    expect([body['id_token'], body.containsKey('email'), body.containsKey('password'), body['owner_name']], ['tok-new', false, false, 'Nina New']);
    expect(Get.find<AuthController>().justSignedUp, isTrue);
  });

  testWidgets('closing the Google sheet does nothing', (t) async {
    final a = await open(t, social: FakeSocial(token: null));
    await t.ensureVisible(find.byKey(const ValueKey('start-google')));
    await t.tap(find.byKey(const ValueKey('start-google')));
    await t.pumpAndSettle();
    expect(a.calls.where((c) => c.path == '/api/auth/social'), isEmpty);
    expect(find.text('Welcome back'), findsOneWidget);
  });

  testWidgets('a Google sheet error is shown', (t) async {
    await open(t, social: FakeSocial(error: "You're offline"));
    await t.ensureVisible(find.byKey(const ValueKey('start-google')));
    await t.tap(find.byKey(const ValueKey('start-google')));
    await t.pumpAndSettle();
    expect(find.text("You're offline"), findsOneWidget);
  });

  /// From the first screen to a salon's own sign-in screen (salon ID, then Continue).
  Future<void> toSalonLogin(WidgetTester t) async {
    await t.ensureVisible(find.text('Use salon ID and password'));
    await t.tap(find.text('Use salon ID and password'));
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextField), 'supersalon');
    await t.pump(kSalonDebounce);
    await t.pumpAndSettle();
    await t.tap(find.text('Continue'));
    await t.pumpAndSettle();
  }

  testWidgets("salon sign-in screen: Google, Apple (iPhone) and an emailed code above the password", (t) async {
    await open(t, social: FakeSocial(token: 'tok-known', hasApple: true));
    await toSalonLogin(t);
    expect(find.text('Sign in to Super Salon'), findsOneWidget);
    expect(find.byKey(const ValueKey('login-google')), findsOneWidget);
    expect(find.byKey(const ValueKey('login-apple')), findsOneWidget);
    expect(find.text('Sign in with an email code instead'), findsNothing);
    await t.tap(find.byKey(const ValueKey('login-code-mode')));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('login-email')), findsOneWidget);
    expect(find.text('Password'), findsNothing);
    await t.tap(find.text('Sign in with your password instead'));
    await t.pumpAndSettle();
    expect(find.text('Password'), findsOneWidget);
  });

  testWidgets('salon sign-in screen: Google with an email on a team signs straight in', (t) async {
    final a = await open(t, social: FakeSocial(token: 'tok-known'));
    await toSalonLogin(t);
    await t.tap(find.byKey(const ValueKey('login-google')));
    await t.pumpAndSettle();
    expect((a.calls.singleWhere((c) => c.path == '/api/auth/social').data as Map)['id_token'], 'tok-known');
    expect(find.text('Hi ali 👋'), findsOneWidget);
  });

  testWidgets('salon sign-in screen: Google with a new email goes to start a salon', (t) async {
    await open(t, social: FakeSocial(token: 'tok-new'));
    await toSalonLogin(t);
    await t.tap(find.byKey(const ValueKey('login-google')));
    await t.pumpAndSettle();
    expect(find.textContaining('Signed in as nina@gmail.com'), findsOneWidget);
  });

  testWidgets('salon sign-in screen: no Firebase, the code stays a link', (t) async {
    await open(t);
    await toSalonLogin(t);
    expect(find.byKey(const ValueKey('login-google')), findsNothing);
    expect(find.text('Sign in with an email code instead'), findsOneWidget);
  });

  test('country flags', () {
    expect(flagOf('AE'), '🇦🇪');
    expect(flagOf('in'), '🇮🇳');
  });
}
