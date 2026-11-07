import 'dart:async';
import 'package:salonkit/core/screen_cache.dart';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/format/fmt.dart';
import 'package:salonkit/data/report_api.dart';
import 'package:salonkit/data/sales_api.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/modules/today/today_screen.dart';

import 'support/fake_adapter.dart';
import 'support/me_fixture.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());

Widget host(FakeAdapter a, Me me, {VoidCallback? onNew, Future<void> Function()? onRefreshMe}) {
  final c = ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 'skm_t', adapter: a);
  return MaterialApp(
    home: Scaffold(
      body: TodayScreen(
        me: me,
        sales: SalesApi(c, me.fmt),
        report: ReportApi(c),
        onNewSale: () async => onNew?.call(),
        onOpenSale: (_) async {},
        onRefreshMe: onRefreshMe,
      ),
    ),
  );
}

Map<String, Handler> ok() => {
      'GET /api/reports/me': (o) => raw('report_me.json'),
      'GET /api/sales': (o) => raw('sales_page.json'),
    };

void main() {
  setUp(ScreenCache.clear);
  final barber = meWith(barber: true);

  testWidgets('skeleton while loading', (t) async {
    final hold = Completer<Object?>();
    await t.pumpWidget(host(FakeAdapter({...ok(), 'GET /api/reports/me': (o) => hold.future}), barber));
    await t.pump();
    expect(find.byKey(const ValueKey('skeleton')), findsWidgets);
    hold.complete(raw('report_me.json'));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('skeleton')), findsNothing);
  });

  testWidgets('data: tiles and today\'s sales', (t) async {
    final a = FakeAdapter(ok());
    await t.pumpWidget(host(a, barber));
    await t.pumpAndSettle();
    expect(find.text('Hi ali 👋'), findsOneWidget);
    expect(find.text('My sales today'), findsOneWidget);
    expect(find.text('AED 90'), findsWidgets);
    expect(find.text('2 customers'), findsOneWidget);
    expect(find.text('My commission'), findsOneWidget);
    expect(find.text('Omar'), findsOneWidget);
    expect(find.text('Customer 1'), findsOneWidget);
    expect(find.textContaining('Haircut, Hair oil ×2'), findsOneWidget);
    final sales = a.calls.firstWhere((c) => c.path == '/api/sales');
    expect(sales.queryParameters['day'], barber.today);
  });

  testWidgets('a new business day reloads Today for that day', (t) async {
    final a = FakeAdapter(ok());
    await t.pumpWidget(host(a, barber));
    await t.pumpAndSettle();
    final j = fx('me_barber.json')..['today'] = '2026-12-01';
    await t.pumpWidget(host(a, Me.fromJson(j)));
    await t.pumpAndSettle();
    final days = a.calls.where((c) => c.path == '/api/sales').map((c) => c.queryParameters['day']).toList();
    expect(days, [barber.today, '2026-12-01']);
    expect(a.calls.where((c) => c.path == '/api/reports/me').last.queryParameters['month'], '2026-12');
  });

  testWidgets('pull to refresh also re-reads the business day', (t) async {
    var n = 0;
    await t.pumpWidget(host(FakeAdapter(ok()), barber, onRefreshMe: () async => n++));
    await t.pumpAndSettle();
    await t.fling(find.text('My sales today'), const Offset(0, 400), 1000);
    await t.pumpAndSettle();
    expect(n, 1);
  });

  testWidgets('an admin sees only their own sales today and can add their own expense', (t) async {
    final a = FakeAdapter(ok());
    final admin = meWith(); // the owner fixture
    await t.pumpWidget(host(a, admin));
    await t.pumpAndSettle();
    final q = a.calls.firstWhere((c) => c.path == '/api/sales').queryParameters;
    expect(q['barber_id'], admin.user.id);
    expect(find.text('Add'), findsOneWidget);
  });

  testWidgets('empty day', (t) async {
    await t.pumpWidget(host(FakeAdapter({...ok(), 'GET /api/sales': (o) => {'items': [], 'total': 0, 'page': 1, 'page_size': 200, 'sum': 0}}), barber));
    await t.pumpAndSettle();
    expect(find.text('No sales yet today. Tap “New sale” after each customer.'), findsOneWidget);
  });

  testWidgets('error then Retry loads again', (t) async {
    var n = 0;
    await t.pumpWidget(host(FakeAdapter({...ok(), 'GET /api/sales': (o) => n++ == 0 ? const FakeReply(500, {'error': 'x'}) : raw('sales_page.json')}), barber));
    await t.pumpAndSettle();
    expect(find.text('Something went wrong. Try again.'), findsOneWidget);
    await t.tap(find.text('Retry'));
    await t.pumpAndSettle();
    expect(find.text('Omar'), findsOneWidget);
  });

  testWidgets('expense: admin adds it when the barber may not', (t) async {
    await t.pumpWidget(host(FakeAdapter(ok()), barber));
    await t.pumpAndSettle();
    expect(find.text('None — the admin adds expenses'), findsOneWidget);
    expect(find.text('Add'), findsNothing);
  });

  testWidgets('expense: the barber adds today\'s', (t) async {
    final a = FakeAdapter({...ok(), 'PUT /api/expenses': (o) => {'ok': true}});
    await t.pumpWidget(host(a, meWith(barber: true, canAddExpense: true)));
    await t.pumpAndSettle();
    expect(find.text('Not added yet — add it before you leave'), findsOneWidget);
    await t.tap(find.text('Add'));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const ValueKey('expense-amount')), '15');
    await t.enterText(find.byKey(const ValueKey('expense-note')), 'Tea');
    await t.tap(find.text('Save'));
    await t.pumpAndSettle();
    expect(a.calls.where((c) => c.method == 'PUT').single.data, {'amount': '15', 'note': 'Tea'});
  });

  testWidgets('New sale button calls back; hidden when the salon is read-only', (t) async {
    var n = 0;
    await t.pumpWidget(host(FakeAdapter(ok()), barber, onNew: () => n++));
    await t.pumpAndSettle();
    await t.tap(find.text('New sale'));
    expect(n, 1);

    final j = fx('me_barber.json');
    (j['org'] as Map)['status'] = 'suspended';
    await t.pumpWidget(host(FakeAdapter(ok()), Me.fromJson(j)));
    await t.pumpAndSettle();
    expect(find.text('New sale'), findsNothing);
    expect(find.text('Your subscription has ended. Upgrade to add or change sales.'), findsOneWidget);
  });
}
