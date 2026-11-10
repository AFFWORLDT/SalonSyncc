// App Store screenshots, against the live demo salon. Prints "SHOT:<name>" and holds still while
// tool/store_screenshots.sh captures the simulator screen (status bar included).
// flutter test integration_test/store_screenshots_test.dart -d <simulator> --dart-define=SHOT_PW=<demo password>
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:salonkit/main.dart' as app;

const _pw = String.fromEnvironment('SHOT_PW');

Future<void> settle(WidgetTester t, [double seconds = 2]) async {
  for (var i = 0; i < seconds * 10; i++) {
    await t.pump(const Duration(milliseconds: 100));
  }
}

Future<void> waitFor(WidgetTester t, Finder f, {int seconds = 20}) async {
  for (var i = 0; i < seconds * 10; i++) {
    if (f.evaluate().isNotEmpty) return;
    await t.pump(const Duration(milliseconds: 100));
  }
  // ignore: avoid_print
  print('SHOT:zz_failed');
  await settle(t, 4);
  expect(f, findsWidgets);
}

Future<void> shot(WidgetTester t, String name) async {
  await settle(t, 2.5);
  // ignore: avoid_print
  print('SHOT:$name');
  await settle(t, 4); // the host takes the picture now
}

Future<void> openFromProfile(WidgetTester t, String title) async {
  if (find.byKey(const ValueKey('top-profile')).evaluate().isEmpty) {
    // ignore: avoid_print
    print('SHOT:zz_before_$title');
    await settle(t, 4);
    await t.tap(find.text('Dashboard').last);
    await settle(t, 2);
  }
  await t.tap(find.byKey(const ValueKey('top-profile')));
  await waitFor(t, find.byKey(const ValueKey('profile-back')));
  await t.scrollUntilVisible(find.text(title), 200, scrollable: find.byType(Scrollable).first);
  await settle(t, 1); // the list stops moving before the tap
  await t.tap(find.text(title).last);
  await settle(t, 2);
  await waitFor(t, find.byKey(const ValueKey('top-profile')).evaluate().isEmpty && find.byKey(const ValueKey('profile-back')).evaluate().isEmpty ? find.text(title) : find.byType(BackButton));
  await settle(t, 2);
}

/// A service tile, after picking its category pill when it isn't on screen.
Future<void> tapService(WidgetTester t, String category, String name) async {
  if (find.text(name).evaluate().isEmpty) {
    if (find.text(category).evaluate().isEmpty) {
      // ignore: avoid_print
      print('SHOT:zz_no_$category');
      await settle(t, 4);
    }
    await t.tap(find.text(category).first);
    await settle(t, 1);
  }
  await waitFor(t, find.text(name));
  await t.tap(find.text(name).first);
  await settle(t, 0.5);
}

/// Back to the tabs, whatever is open (a module page, then the profile).
Future<void> back(WidgetTester t) async {
  for (var i = 0; i < 4 && find.byKey(const ValueKey('top-profile')).evaluate().isEmpty; i++) {
    await t.binding.handlePopRoute(); // the system back gesture
    await settle(t, 1);
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('store screenshots', (t) async {
    await app.run(crashReports: false, push: false);
    await settle(t, 3);
    if (find.text('Use salon ID and password').evaluate().isNotEmpty) {
      await t.tap(find.text('Use salon ID and password'));
    }
    await waitFor(t, find.text('Enter your salon ID'));
    await t.enterText(find.byType(TextField), 'luxe');
    await waitFor(t, find.text('Luxe Barbers'));
    FocusManager.instance.primaryFocus?.unfocus(); // the keyboard can cover the button
    await settle(t, 1);
    await t.tap(find.widgetWithText(FilledButton, 'Continue'));
    await waitFor(t, find.textContaining('Luxe Barbers'));
    await waitFor(t, find.widgetWithText(TextField, 'Your password'));
    await t.enterText(find.widgetWithText(TextField, 'you@salon.com or ali'), 'appreview');
    await t.enterText(find.widgetWithText(TextField, 'Your password'), _pw);
    FocusManager.instance.primaryFocus?.unfocus();
    await settle(t, 1);
    await t.tap(find.text('Sign in').last);
    await waitFor(t, find.text('Sales today'));
    // "Unlock with Face ID?" on a phone with biometrics: not now.
    if (find.text('Not now').evaluate().isNotEmpty) await t.tap(find.text('Not now'));
    // The demo salon's "Get your salon ready" card: hidden (it remembers that on this phone).
    if (find.byTooltip('Hide').evaluate().isNotEmpty) await t.tap(find.byTooltip('Hide').first);
    await shot(t, '01_dashboard');

    await t.drag(find.byType(Scrollable).first, const Offset(0, -700));
    await shot(t, '02_dashboard_more');
    await t.drag(find.byType(Scrollable).first, const Offset(0, 1400));
    await settle(t, 1);

    // The sale flow on phones only (the iPad's wider sheet lays its steps out differently).
    final phone = t.view.physicalSize.width / t.view.devicePixelRatio < 700;
    if (phone) {
      await t.tap(find.text('New sale').first);
      await waitFor(t, find.text('Who did this customer?'));
      await waitFor(t, find.text('Omar Haddad'));
      await settle(t, 1);
      await settle(t, 2);
      await t.tap(find.text('Omar Haddad').last, warnIfMissed: false); // .last: the sheet's tile, not the dashboard's row
      await settle(t, 1);
      if (find.byKey(const ValueKey('next')).evaluate().isNotEmpty) await t.tap(find.byKey(const ValueKey('next')));
      await settle(t, 2);
      await tapService(t, 'Packages', 'Haircut + beard');
      await tapService(t, 'Treatments', 'Head & shoulder massage');
      await shot(t, '03_new_sale');
      if (find.byKey(const ValueKey('next')).evaluate().isNotEmpty) await t.tap(find.byKey(const ValueKey('next')));
      await waitFor(t, find.text('Card'));
      await t.tap(find.text('Card'));
      await t.tap(find.byKey(const ValueKey('save')));
      await waitFor(t, find.text('Congrats! Bill generated'));
      await shot(t, '04_bill');
      await t.tap(find.text('Done'));
      await settle(t, 2);
    }
    await t.tap(find.text('Sales').last);
    await shot(t, '05_sales');
    await t.tap(find.text('Daily sheet').last);
    await shot(t, '06_daily_sheet');

    await openFromProfile(t, 'Ratings');
    await shot(t, '07_ratings');
    await back(t);
    await openFromProfile(t, 'Customers');
    await shot(t, '08_customers');
    await back(t);
    await openFromProfile(t, 'Staff');
    await shot(t, '09_staff');
    await back(t);
    await openFromProfile(t, 'Monthly');
    await shot(t, '10_monthly');
    await back(t);
    await t.tap(find.byKey(const ValueKey('top-profile')));
    await waitFor(t, find.byKey(const ValueKey('profile-back')));
    await shot(t, '11_profile');
  });
}
