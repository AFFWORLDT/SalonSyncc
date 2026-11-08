// End to end for the owner's "More" screens, against a local API (see sign_in_test.dart for the setup).
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

/// Opens a screen from "More" (scrolling the list if needed).
Future<void> openMore(WidgetTester t, String title) async {
  await waitGone(t, find.byType(SnackBar)); // a toast can cover the bottom rows
  await t.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('More')));
  await waitFor(t, find.byType(ListTile));
  await settle(t, 1);
  await t.scrollUntilVisible(find.text(title), 200, scrollable: find.byType(Scrollable).first);
  // scrollUntilVisible can leave the row under the status bar; bring it down into the tappable area.
  if (t.getCenter(find.text(title)).dy < 160) {
    await t.drag(find.byType(Scrollable).first, const Offset(0, 160));
    await settle(t, 1);
  }
  await t.tap(find.text(title));
  await settle(t, 1);
}

/// Back to the "More" list, once any closing sheet or toast has finished animating (a tap during it hits the barrier).
/// Closes the keyboard (it can cover a sheet's buttons), as a person would before tapping Save.
Future<void> hideKeyboard(WidgetTester t) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await settle(t, 1);
}

Future<void> back(WidgetTester t) async {
  await settle(t, 1);
  await t.pageBack();
  await settle(t, 1);
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('owner: services, monthly, ledger, settings, plan', (t) async {
    await app.run(crashReports: false);
    await waitFor(t, find.byType(TextField));
    if (find.text('Enter your salon ID').evaluate().isNotEmpty) {
      await t.enterText(find.byType(TextField), 'e2esalon');
      await waitFor(t, find.text('E2E Salon'));
      await t.tap(find.text('Continue'));
    }
    await waitFor(t, find.text('Sign in to E2E Salon'));
    await t.enterText(find.widgetWithText(TextField, 'Email or username'), 'owner');
    await t.enterText(find.widgetWithText(TextField, 'Password'), 'pass1234');
    await hideKeyboard(t);
    await t.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await waitFor(t, find.text('Sales today'));
    await settle(t);

    await openMore(t, 'Services');
    await waitFor(t, find.text('Haircut'));
    await t.tap(find.widgetWithText(FilledButton, 'Add service'));
    await waitFor(t, find.byKey(const ValueKey('svc-name')));
    await t.enterText(find.byKey(const ValueKey('svc-group')), 'Hair');
    await t.enterText(find.byKey(const ValueKey('svc-name')), 'Kids cut');
    await t.enterText(find.byKey(const ValueKey('svc-price')), '30');
    await hideKeyboard(t);
    await t.tap(find.widgetWithText(FilledButton, 'Add service').last);
    await waitGone(t, find.byKey(const ValueKey('svc-name')));
    await waitFor(t, find.text('Kids cut'));
    await back(t);

    await openMore(t, 'Monthly');
    await waitFor(t, find.textContaining('Sales 20')); // the year tile, at the top
    await back(t);

    await openMore(t, 'Ledger');
    await waitFor(t, find.text('Opening balance'));
    await t.tap(find.text('Move money'));
    await waitFor(t, find.byKey(const ValueKey('tx-amount')));
    await t.enterText(find.byKey(const ValueKey('tx-amount')), '5');
    await hideKeyboard(t);
    await t.tap(find.widgetWithText(FilledButton, 'Save'));
    await waitGone(t, find.byKey(const ValueKey('tx-amount')));
    await waitFor(t, find.text('Moved to bank'));
    await back(t);

    await openMore(t, 'Settings');
    await waitFor(t, find.text('Billing'));
    await t.scrollUntilVisible(find.byKey(const ValueKey('set-receipt_footer')), 300, scrollable: find.byType(Scrollable).first);
    await t.enterText(find.byKey(const ValueKey('set-receipt_footer')), 'See you soon!');
    await hideKeyboard(t);
    await t.scrollUntilVisible(find.text('Save settings'), 300, scrollable: find.byType(Scrollable).first);
    await t.tap(find.text('Save settings'));
    await waitFor(t, find.text('Settings saved'));
    await waitGone(t, find.text('Settings saved')); // the toast covers the bottom of the More list
    await back(t);

    await openMore(t, 'Plan');
    await waitFor(t, find.text('Included in your plan'));
    expect(find.textContaining("You're on Pro Max"), findsOneWidget);
    await back(t);

    await openMore(t, 'My account');
    await waitFor(t, find.text('Sign out'));
    await t.tap(find.text('Sign out'));
    await waitFor(t, find.text('Sign in to E2E Salon'));
  });
}
