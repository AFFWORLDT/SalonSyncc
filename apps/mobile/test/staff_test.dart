import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/data/staff_api.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/modules/staff/staff_screen.dart';

import 'support/fake_adapter.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
Me owner({int? maxStaff}) {
  final j = raw('me_owner_e2e.json') as Map<String, dynamic>;
  j['limits'] = {'max_staff': maxStaff};
  return Me.fromJson(j);
}

void main() {
  Future<FakeAdapter> pump(WidgetTester t, {Me? me, Map<String, Handler> extra = const {}}) async {
    final a = FakeAdapter({'GET /api/users': (o) => raw('users.json'), ...extra});
    t.view.physicalSize = const Size(800, 2400);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      home: Scaffold(body: StaffScreen(me: me ?? owner(maxStaff: 10), api: StaffApi(ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a)))),
    ));
    await t.pumpAndSettle();
    return a;
  }

  testWidgets('groups, details and the plan line', (t) async {
    await pump(t);
    expect(find.text('Staff'), findsOneWidget);
    expect(find.text('Shop default commission: 0% (change in Settings)'), findsOneWidget);
    expect(find.text('2 of 10 active staff'), findsOneWidget);
    expect(find.text('Owner'), findsWidgets);
    expect(find.text('Barbers'), findsOneWidget);
    expect(find.text('@sam · 40%'), findsOneWidget);
    expect(find.text('@barber · 0% (default)'), findsOneWidget);
  });

  testWidgets('at the limit: Add disabled, upgrade hint', (t) async {
    await pump(t, me: owner(maxStaff: 2));
    expect(find.text('2 of 2 active staff'), findsOneWidget);
    expect(t.widget<FilledButton>(find.widgetWithText(FilledButton, 'Add staff')).onPressed, isNull);
  });

  testWidgets('add: name fills the username; POST; the plan limit answer', (t) async {
    final a = await pump(t, extra: {'POST /api/users': (o) => const FakeReply(409, {'error': 'Staff limit reached for your plan', 'code': 'staff_limit'})});
    await t.tap(find.text('Add staff'));
    await t.pumpAndSettle();
    expect(find.text('They sign in with this username and password.'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('st-name')), 'Omar Khan');
    expect(find.widgetWithText(TextField, 'omarkhan'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('st-password')), 'abc');
    await t.tap(find.text('Save'));
    await t.pumpAndSettle();
    expect(find.text('Password must be at least 4 characters'), findsOneWidget);
    expect(a.calls.where((c) => c.method == 'POST'), isEmpty);
    await t.enterText(find.byKey(const ValueKey('st-password')), 'pass1234');
    await t.ensureVisible(find.byKey(const ValueKey('st-email')));
    await t.enterText(find.byKey(const ValueKey('st-email')), ' omar@mail.com ');
    await t.tap(find.text('Save'));
    await t.pumpAndSettle();
    final body = a.calls.singleWhere((c) => c.method == 'POST').data as Map;
    expect(body['username'], 'omarkhan');
    expect(body['email'], 'omar@mail.com');
    expect(body.containsKey('sort_order'), isFalse, reason: 'blank = the server puts them last in the sheet');
    expect(find.text('Your salon can have 10 active staff right now.'), findsOneWidget);
  });

  testWidgets('adding someone with an email sends them an invite link (switch on by default)', (t) async {
    final created = Map<String, dynamic>.from((raw('users.json') as List).last as Map)..addAll({'id': 99, 'name': 'Omar Khan', 'username': 'omarkhan', 'email': 'omar@mail.com'});
    final a = await pump(t, extra: {
      'POST /api/users': (o) => FakeReply(201, created),
      'POST /api/users/99/invite': (o) => {'ok': true, 'email': 'omar@mail.com'},
    });
    await t.tap(find.text('Add staff'));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const ValueKey('st-name')), 'Omar Khan');
    await t.enterText(find.byKey(const ValueKey('st-password')), 'pass1234');
    await t.ensureVisible(find.byKey(const ValueKey('st-email')));
    expect(find.byKey(const ValueKey('st-invite')), findsNothing);
    await t.enterText(find.byKey(const ValueKey('st-email')), 'omar@mail.com');
    await t.pump();
    expect(find.byKey(const ValueKey('st-invite')), findsOneWidget);
    await t.tap(find.text('Save'));
    await t.pumpAndSettle();
    expect(a.calls.where((c) => c.path == '/api/users/99/invite'), hasLength(1));
    expect(find.textContaining('Invite sent to omar@mail.com'), findsOneWidget);
  });

  testWidgets('owner card has no inactive / delete; barber card has', (t) async {
    await pump(t);
    await t.tap(find.byTooltip('Actions for Owner'));
    await t.pumpAndSettle();
    expect(find.text('Delete'), findsNothing);
    expect(find.text('Make inactive'), findsNothing);
    await t.tapAt(const Offset(5, 5));
    await t.pumpAndSettle();
    await t.tap(find.byTooltip('Actions for Barber Sam'));
    await t.pumpAndSettle();
    expect(find.text('Delete'), findsOneWidget);
    expect(find.text('Make inactive'), findsOneWidget);
  });

  testWidgets('delete someone with sales: made inactive instead', (t) async {
    final a = await pump(t, extra: {'DELETE /api/users/37': (o) => {'ok': true, 'deactivated': true}});
    await t.tap(find.byTooltip('Actions for Barber Sam'));
    await t.pumpAndSettle();
    await t.tap(find.text('Delete'));
    await t.pumpAndSettle();
    expect(find.text('Delete Barber Sam?'), findsOneWidget);
    await t.tap(find.widgetWithText(FilledButton, 'Delete'));
    await t.pumpAndSettle();
    expect(a.calls.where((c) => c.method == 'DELETE'), hasLength(1));
    expect(find.text('Barber Sam has sales, so they were made inactive (history kept)'), findsOneWidget);
  });

  testWidgets('reset password', (t) async {
    final a = await pump(t, extra: {'POST /api/users/37/reset-password': (o) => {'ok': true}});
    await t.tap(find.byTooltip('Actions for Barber Sam'));
    await t.pumpAndSettle();
    await t.tap(find.text('Reset password'));
    await t.pumpAndSettle();
    expect(find.text('New password for Barber Sam (@sam).'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('reset-pw')), 'newpass1');
    await t.tap(find.text('Set password'));
    await t.pumpAndSettle();
    expect(a.calls.singleWhere((c) => c.method == 'POST').data, {'password': 'newpass1'});
    expect(find.text('New password set for Barber Sam. They are signed out everywhere.'), findsOneWidget);
  });

  testWidgets('make inactive sends the full user with active false', (t) async {
    final a = await pump(t, extra: {'PUT /api/users/37': (o) => {...((raw('users.json') as List)[1] as Map<String, dynamic>), 'active': false}});
    await t.tap(find.byTooltip('Actions for Barber Sam'));
    await t.pumpAndSettle();
    await t.tap(find.text('Make inactive'));
    await t.pumpAndSettle();
    final body = a.calls.singleWhere((c) => c.method == 'PUT').data as Map;
    expect(body['active'], false);
    expect(body['username'], 'sam');
    expect(body['commission_pct'], '40');
    expect(find.text('Barber Sam is now inactive'), findsOneWidget);
  });
}
