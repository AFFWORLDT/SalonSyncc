// End to end for the owner, against a local API (see sign_in_test.dart for the setup).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:salonkit/main.dart' as app;

Future<void> settle(WidgetTester t, [int seconds = 2]) async {
  for (var i = 0; i < seconds * 10; i++) {
    await t.pump(const Duration(milliseconds: 100));
  }
}

Future<void> waitFor(WidgetTester t, Finder f, {int seconds = 15}) async {
  for (var i = 0; i < seconds * 10; i++) {
    if (f.evaluate().isNotEmpty) return;
    await t.pump(const Duration(milliseconds: 100));
  }
  expect(f, findsWidgets);
}

Future<void> waitGone(WidgetTester t, Finder f, {int seconds = 10}) async {
  for (var i = 0; i < seconds * 10; i++) {
    if (f.evaluate().isEmpty) return;
    await t.pump(const Duration(milliseconds: 100));
  }
  expect(f, findsNothing);
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('owner: dashboard, a sale for a barber, sales, daily sheet, staff', (t) async {
    await app.main();
    await waitFor(t, find.text('Enter your salon ID').evaluate().isNotEmpty ? find.text('Enter your salon ID') : find.byType(TextField));
    if (find.text('Enter your salon ID').evaluate().isNotEmpty) {
      await t.enterText(find.byType(TextField), 'e2esalon');
      await waitFor(t, find.text('E2E Salon'));
      await t.tap(find.text('Continue'));
    }
    await waitFor(t, find.text('Sign in to E2E Salon'));
    await t.enterText(find.widgetWithText(TextField, 'Username'), 'owner');
    await t.enterText(find.widgetWithText(TextField, 'Password'), 'pass1234');
    FocusManager.instance.primaryFocus?.unfocus(); // the keyboard can cover the button
    await settle(t, 1);
    await t.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await waitFor(t, find.text('Sales today'));
    await settle(t);

    await t.tap(find.text('New sale').first);
    await waitFor(t, find.text('Who did this customer?'));
    await waitFor(t, find.text('Barber Ali'));
    await t.tap(find.text('Barber Ali'));
    await settle(t, 1);
    await t.tap(find.byKey(const ValueKey('next')));
    await waitFor(t, find.widgetWithText(ActionChip, 'Haircut'));
    await t.tap(find.widgetWithText(ActionChip, 'Haircut'));
    await settle(t, 1);
    await t.tap(find.byKey(const ValueKey('next')));
    await waitFor(t, find.text('Cash'));
    await t.tap(find.text('Cash'));
    await t.tap(find.byKey(const ValueKey('save')));
    await waitFor(t, find.text('Congrats! Bill generated'));
    await t.tap(find.text('Done'));
    await waitGone(t, find.text('Congrats! Bill generated'));
    await waitFor(t, find.text('AED 40')); // the dashboard reloaded with the new bill

    await t.tap(find.text('Sales').last);
    await waitFor(t, find.textContaining('1 sale · AED 40'));

    await t.tap(find.text('Daily sheet').last);
    await waitFor(t, find.text('Total sale'));
    await waitFor(t, find.text('Barber Ali')); // the table arrives after the tiles' labels

    await t.tap(find.text('More'));
    await waitFor(t, find.text('Staff'));
    await t.tap(find.text('Staff'));
    await waitFor(t, find.text('@barber · 0% (default)'));
    await t.pageBack();
    await settle(t, 1);

    await t.scrollUntilVisible(find.text('My account'), 200, scrollable: find.byType(Scrollable).first);
    await t.tap(find.text('My account'));
    await waitFor(t, find.text('Sign out'));
    await t.tap(find.text('Sign out'));
    await waitFor(t, find.text('Sign in to E2E Salon'));
  });
}
