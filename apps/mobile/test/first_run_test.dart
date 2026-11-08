import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/auth_ui/first_run_screen.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/data/settings_api.dart';
import 'package:salonkit/data/staff_api.dart';
import 'package:salonkit/models/me.dart';

import 'support/fake_adapter.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
final owner = Me.fromJson(raw('me_owner_e2e.json') as Map<String, dynamic>);

void main() {
  testWidgets('skip the logo; invite the team: a taken email is shown on its row, the rest go through', (t) async {
    final template = Map<String, dynamic>.from((raw('users.json') as List).last as Map);
    var id = 200;
    final a = FakeAdapter({
      'POST /api/users': (o) => (o.data as Map)['email'] == 'taken@mail.com'
          ? const FakeReply(409, {'error': 'This email is already used by someone on SalonKit. Each person needs their own email.', 'code': 'email_taken'})
          : FakeReply(201, {...template, 'id': ++id, 'name': (o.data as Map)['name'], 'username': (o.data as Map)['username'], 'email': (o.data as Map)['email']}),
      'POST /api/users/201/invite': (o) => {'ok': true, 'email': 'omar@mail.com'},
      'POST /api/users/202/invite': (o) => {'ok': true, 'email': 'fixed@mail.com'},
    });
    t.view.physicalSize = const Size(1080, 2400);
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    final c = ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a);
    await t.pumpWidget(MaterialApp(home: Builder(builder: (ctx) => TextButton(
          onPressed: () => Navigator.of(ctx).push(MaterialPageRoute<void>(builder: (_) => FirstRunScreen(me: owner, settings: SettingsApi(c), staff: StaffApi(c)))),
          child: const Text('go'),
        ))));
    await t.tap(find.text('go'));
    await t.pumpAndSettle();
    expect(find.text("Add your salon's logo"), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('fr-skip')));
    await t.pumpAndSettle();
    expect(find.text('Invite your team'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('fr-name-0')), 'Omar');
    await t.enterText(find.byKey(const ValueKey('fr-email-0')), 'Omar@Mail.com');
    await t.tap(find.text('Add another'));
    await t.pump();
    await t.enterText(find.byKey(const ValueKey('fr-name-1')), 'Lee');
    await t.enterText(find.byKey(const ValueKey('fr-email-1')), 'taken@mail.com');
    await t.tap(find.text('Send invites'));
    await t.pumpAndSettle();
    final created = [for (final x in a.calls.where((x) => x.path == '/api/users')) x.data as Map];
    expect(created.first['username'], 'omar@mail.com');
    expect(created.first['email'], 'omar@mail.com');
    expect((created.first['password'] as String).length, 20);
    expect(find.text('Invite sent'), findsOneWidget);
    expect(find.textContaining('already used by someone'), findsOneWidget);
    expect(find.text('Invite your team'), findsOneWidget, reason: 'stays until every row is sent or emptied');
    await t.enterText(find.byKey(const ValueKey('fr-email-1')), 'fixed@mail.com');
    await t.tap(find.text('Send invites'));
    await t.pumpAndSettle();
    expect(a.calls.where((x) => x.path == '/api/users'), hasLength(3), reason: "Omar isn't created twice");
    expect(find.text("You're all set"), findsOneWidget);
    await t.tap(find.text('Start using SalonKit'));
    await t.pumpAndSettle();
    expect(find.text('go'), findsOneWidget);
  });

  testWidgets('skip everything', (t) async {
    final c = ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: FakeAdapter({}));
    await t.pumpWidget(MaterialApp(home: FirstRunScreen(me: owner, settings: SettingsApi(c), staff: StaffApi(c))));
    await t.tap(find.byKey(const ValueKey('fr-skip')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('fr-skip')));
    await t.pumpAndSettle();
    expect(find.text("You're all set"), findsOneWidget);
  });
}
