import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/data/audit_api.dart';
import 'package:salonkit/data/ratings_api.dart';
import 'package:salonkit/data/staff_api.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/modules/audit/audit_screen.dart';
import 'package:salonkit/modules/ratings/ratings_screen.dart';

import 'support/fake_adapter.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
final owner = Me.fromJson(raw('me_owner_max.json') as Map<String, dynamic>);
ApiClient client(FakeAdapter a) => ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a);

Future<void> big(WidgetTester t) async {
  t.view.physicalSize = const Size(800, 2400);
  t.view.devicePixelRatio = 1;
  addTearDown(t.view.reset);
}

void main() {
  group('Ratings', () {
    testWidgets('google card, average, by barber, latest with filter', (t) async {
      await big(t);
      final a = FakeAdapter({'GET /api/ratings': (o) => raw('ratings.json')});
      await t.pumpWidget(MaterialApp(home: Scaffold(body: RatingsScreen(me: owner, api: RatingsApi(client(a))))));
      await t.pumpAndSettle();
      expect(a.calls.single.queryParameters, {'from': '${owner.today.substring(0, 7)}-01', 'to': owner.today});
      expect(find.text('to Google'), findsOneWidget);
      expect(find.text('0 of 0 customers tapped “Rate your visit” (—)'), findsOneWidget);
      expect(find.text('4.0'), findsWidgets);
      expect(find.text('1 rating'), findsWidgets);
      expect(find.text('“Great fade”'), findsOneWidget);
      await t.tap(find.text('All ratings'));
      await t.pumpAndSettle();
      await t.tap(find.text('1-3 stars').last);
      await t.pumpAndSettle();
      expect(find.text('“Great fade”'), findsNothing);
    });
  });

  group('Audit log', () {
    Future<FakeAdapter> pump(WidgetTester t) async {
      await big(t);
      final a = FakeAdapter({'GET /api/audit': (o) => raw('audit.json'), 'GET /api/users': (o) => raw('users.json')});
      final c = client(a);
      await t.pumpWidget(MaterialApp(home: Scaffold(body: AuditScreen(me: owner, api: AuditApi(c), staff: StaffApi(c)))));
      await t.pumpAndSettle();
      return a;
    }

    Iterable<Map<String, dynamic>> q(FakeAdapter a) => a.calls.where((c) => c.path == '/api/audit').map((c) => c.queryParameters);

    testWidgets('rows with who did what', (t) async {
      final a = await pump(t);
      expect(find.text('Audit log'), findsOneWidget);
      expect(find.text('Every bill, expense and setting change: who did it, when, and what changed. Nothing here can be edited.'), findsOneWidget);
      expect(q(a).first, {'from': owner.today, 'to': owner.today, 'page_size': 50});
      expect(find.text('5 changes'), findsOneWidget);
      expect(find.textContaining('created payout'), findsOneWidget);
    });

    testWidgets('searching hides the dates and leaves them out', (t) async {
      final a = await pump(t);
      expect(find.byKey(const ValueKey('audit-range')), findsOneWidget);
      await t.enterText(find.byType(TextField), 'Sam');
      await t.pump(const Duration(milliseconds: 300));
      await t.pumpAndSettle();
      expect(q(a).last, {'q': 'Sam', 'page_size': 50});
      expect(find.byKey(const ValueKey('audit-range')), findsNothing);
    });

    testWidgets('type filter and detail', (t) async {
      final a = await pump(t);
      await t.tap(find.text('Everything'));
      await t.pumpAndSettle();
      await t.tap(find.text('Barber payouts').last);
      await t.pumpAndSettle();
      expect(q(a).last['entity'], 'payout');
      await t.tap(find.textContaining('created payout'));
      await t.pumpAndSettle();
      expect(find.text('Created payout Barber Sam'), findsOneWidget);
      expect(find.text('Amount'), findsOneWidget);
      expect(find.text('AED 10'), findsOneWidget);
    });
  });
}
