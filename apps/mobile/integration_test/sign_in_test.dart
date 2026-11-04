// End to end against a local API: `tool/seed_dev_salon.sh`, `wrangler dev --local --var ROOT_DOMAIN:` in apps/api,
// then `flutter test integration_test --dart-define=SK_DEV_HOST=http://127.0.0.1:8787` (Android: 10.0.2.2).
// Run on a freshly installed app (no remembered salon).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:salonkit/main.dart' as app;

Future<void> settle(WidgetTester t, [int seconds = 2]) async {
  for (var i = 0; i < seconds * 10; i++) {
    await t.pump(const Duration(milliseconds: 100));
  }
}

Future<void> waitGone(WidgetTester t, Finder f, {int seconds = 10}) async {
  for (var i = 0; i < seconds * 10; i++) {
    if (f.evaluate().isEmpty) return;
    await t.pump(const Duration(milliseconds: 100));
  }
  expect(f, findsNothing);
}

Future<void> waitFor(WidgetTester t, Finder f, {int seconds = 15}) async {
  for (var i = 0; i < seconds * 10; i++) {
    if (f.evaluate().isNotEmpty) return;
    await t.pump(const Duration(milliseconds: 100));
  }
  expect(f, findsWidgets);
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('barber signs in to e2esalon, adds a bill, sees only barber screens, signs out keeping the salon', (t) async {
    await app.main();
    await waitFor(t, find.text('Enter your salon ID'));

    await t.enterText(find.byType(TextField), 'E2ESalon');
    await waitFor(t, find.text('E2E Salon'));
    await t.tap(find.text('Continue'));
    await waitFor(t, find.text('Sign in to E2E Salon'));

    await t.enterText(find.widgetWithText(TextField, 'Username'), 'barber');
    await t.enterText(find.widgetWithText(TextField, 'Password'), 'wrong-pass');
    FocusManager.instance.primaryFocus?.unfocus(); // the keyboard can cover the button
    await settle(t, 1);
    await t.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await waitFor(t, find.text('Wrong salon ID, username or password'));

    await t.tap(find.widgetWithText(TextField, 'Password')); // focus it again (the keyboard was closed)
    await settle(t, 1);
    await t.enterText(find.widgetWithText(TextField, 'Password'), 'pass1234');
    FocusManager.instance.primaryFocus?.unfocus(); // the keyboard can cover the button
    await settle(t, 1);
    await t.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await waitFor(t, find.text('Hi Barber Ali 👋'));
    await settle(t);

    // A new bill: a service, Cash, saved; it shows in Today and in My bills.
    await t.tap(find.text('New sale'));
    await waitFor(t, find.widgetWithText(ActionChip, 'Haircut'));
    await t.tap(find.widgetWithText(ActionChip, 'Haircut'));
    await settle(t, 1);
    await t.tap(find.byKey(const ValueKey('next')));
    await waitFor(t, find.text('Cash'));
    await t.tap(find.text('Cash'));
    await t.tap(find.byKey(const ValueKey('save')));
    await waitFor(t, find.text('Congrats! Bill generated'));
    expect(find.text('AED 40'), findsWidgets);
    await t.tap(find.text('Done'));
    await waitGone(t, find.text('Congrats! Bill generated'));
    await waitFor(t, find.textContaining('Haircut'));
    expect(find.text('Customer 1'), findsOneWidget);

    await t.tap(find.text('My bills'));
    await waitFor(t, find.textContaining('E2E-'));
    await settle(t, 1); // the tab switch fades the old tab out
    await t.tap(find.text('Customer 1').last);
    await waitFor(t, find.text('Share link'));
    expect(find.text('Edit'), findsOneWidget);
    await t.pageBack();
    await waitGone(t, find.text('Share link'));

    await t.tap(find.text('My history'));
    await waitFor(t, find.text('My commission'));

    // Barber: More holds Announcements and My account; nothing admin-only.
    await t.tap(find.text('More'));
    await waitFor(t, find.text('My account'));
    expect(find.text('Audit log'), findsNothing);
    expect(find.text('Staff'), findsNothing);

    await t.scrollUntilVisible(find.text('My account'), 200, scrollable: find.byType(Scrollable).first);
    await t.tap(find.text('My account'));
    await waitFor(t, find.text('Sign out'));
    await settle(t, 1); // let the page finish sliding in
    await t.tap(find.text('Sign out'));
    await waitFor(t, find.text('Sign in to E2E Salon'));
  });
}
