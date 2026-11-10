import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/data/account_api.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/modules/account/delete_account.dart';

import 'support/fake_adapter.dart';
import 'support/me_fixture.dart';

void main() {
  Future<(FakeAdapter, List<bool>)> open(WidgetTester t, Me me, Handler h) async {
    final a = FakeAdapter({'DELETE /api/me': h});
    final api = AccountApi(ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a));
    final deleted = <bool>[];
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(builder: (c) => TextButton(onPressed: () => showDeleteAccount(c, me, api: api, onDeleted: (gone) async => deleted.add(gone)), child: const Text('open'))),
      ),
    ));
    await t.tap(find.text('open'));
    await t.pumpAndSettle();
    return (a, deleted);
  }

  FilledButton button(WidgetTester t) => t.widget<FilledButton>(find.byKey(const ValueKey('delete-account-yes')));

  testWidgets('owner: the salon ID unlocks it, then the salon is gone', (t) async {
    final me = meWith();
    final (a, deleted) = await open(t, me, (o) => {'ok': true});
    expect(find.text('Delete your salon account'), findsOneWidget);
    expect(button(t).onPressed, isNull);
    await t.enterText(find.byKey(const ValueKey('delete-confirm')), 'DELETE');
    await t.pump();
    expect(button(t).onPressed, isNull);
    await t.enterText(find.byKey(const ValueKey('delete-confirm')), me.org.slug);
    await t.pump();
    await t.tap(find.byKey(const ValueKey('delete-account-yes')));
    await t.pumpAndSettle();
    expect(a.calls.single.data, {'confirm': me.org.slug});
    expect(deleted, [true]);
  });

  testWidgets('staff: DELETE unlocks it; a server error stays on screen', (t) async {
    final (a, deleted) = await open(t, meWith(barber: true), (o) => const FakeReply(400, {'error': 'Type DELETE to confirm'}));
    expect(find.text('Delete your account'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('delete-confirm')), 'delete');
    await t.pump();
    await t.tap(find.byKey(const ValueKey('delete-account-yes')));
    await t.pumpAndSettle();
    expect(a.calls, hasLength(1));
    expect(find.text('Type DELETE to confirm'), findsWidgets);
    expect(deleted, isEmpty);
  });
}
