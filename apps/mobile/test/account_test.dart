import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/data/account_api.dart';
import 'package:salonkit/modules/account/change_password.dart';

import 'support/fake_adapter.dart';

void main() {
  Future<FakeAdapter> open(WidgetTester t, Handler h) async {
    final a = FakeAdapter({'PUT /api/me/password': h});
    final api = AccountApi(ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a));
    await t.pumpWidget(MaterialApp(
      home: Scaffold(body: Builder(builder: (c) => TextButton(onPressed: () => showChangePassword(c, api), child: const Text('open')))),
    ));
    await t.tap(find.text('open'));
    await t.pumpAndSettle();
    return a;
  }

  Future<void> fill(WidgetTester t, String cur, String next, String again) async {
    await t.enterText(find.byKey(const ValueKey('pw-current')), cur);
    await t.enterText(find.byKey(const ValueKey('pw-next')), next);
    await t.enterText(find.byKey(const ValueKey('pw-again')), again);
    await t.tap(find.byKey(const ValueKey('pw-save')));
    await t.pumpAndSettle();
  }

  testWidgets('short or mismatched: says so, no call', (t) async {
    final a = await open(t, (o) => {'ok': true});
    await fill(t, 'pass1234', 'abc', 'abc');
    expect(find.text('New password must be at least 6 characters'), findsOneWidget);
    await fill(t, 'pass1234', 'newpass99', 'newpass98');
    expect(find.text("Passwords don't match"), findsOneWidget);
    expect(a.calls, isEmpty);
  });

  testWidgets('server error is shown', (t) async {
    await open(t, (o) => const FakeReply(400, {'error': 'Current password is wrong'}));
    await fill(t, 'nope1234', 'newpass99', 'newpass99');
    expect(find.text('Current password is wrong'), findsOneWidget);
  });

  testWidgets('success closes and confirms', (t) async {
    final a = await open(t, (o) => {'ok': true});
    await fill(t, 'pass1234', 'newpass99', 'newpass99');
    expect(a.calls.single.data, {'current': 'pass1234', 'next': 'newpass99'});
    expect(find.byKey(const ValueKey('pw-save')), findsNothing);
    expect(find.text('Password changed'), findsOneWidget);
  });
}
