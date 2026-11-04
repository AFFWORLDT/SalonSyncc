import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/format/fmt.dart';
import 'package:salonkit/data/report_api.dart';
import 'package:salonkit/data/sales_api.dart';
import 'package:salonkit/modules/bills/bills_screen.dart';
import 'package:salonkit/modules/history/history_screen.dart';

import 'support/fake_adapter.dart';
import 'support/me_fixture.dart';

Map<String, dynamic> raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync()) as Map<String, dynamic>;
final me = meWith(barber: true);
ApiClient client(FakeAdapter a) => ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a);

void main() {
  group('My bills', () {
    Widget host(FakeAdapter a) => MaterialApp(home: Scaffold(body: BillsScreen(me: me, sales: SalesApi(client(a), me.fmt), onOpen: (_) async {})));

    testWidgets('lists bills, search debounces then sends q once', (t) async {
      final a = FakeAdapter({'GET /api/sales': (o) => raw('sales_page.json')});
      await t.pumpWidget(host(a));
      await t.pumpAndSettle();
      expect(find.text('Omar'), findsOneWidget);
      expect(find.textContaining('E2E-20261104-001 · '), findsOneWidget);
      expect(a.calls.single.queryParameters, {'page_size': 50});
      await t.enterText(find.byKey(const ValueKey('bill-search')), 'om');
      await t.pump(const Duration(milliseconds: 100));
      await t.enterText(find.byKey(const ValueKey('bill-search')), 'oma');
      await t.pump(const Duration(milliseconds: 300));
      await t.pumpAndSettle();
      expect(a.calls, hasLength(2));
      expect(a.calls.last.queryParameters, {'q': 'oma', 'page_size': 50});
    });

    testWidgets('Show more asks for the next 50', (t) async {
      final page = raw('sales_page.json')..['total'] = 120;
      final a = FakeAdapter({'GET /api/sales': (o) => page});
      await t.pumpWidget(host(a));
      await t.pumpAndSettle();
      await t.tap(find.text('Show more'));
      await t.pumpAndSettle();
      expect(a.calls.last.queryParameters, {'page_size': 100});
    });

    testWidgets('no results', (t) async {
      await t.pumpWidget(host(FakeAdapter({'GET /api/sales': (o) => {'items': [], 'total': 0, 'page': 1, 'page_size': 50, 'sum': 0}})));
      await t.pumpAndSettle();
      expect(find.text('No bills found'), findsOneWidget);
      expect(find.text('Show more'), findsNothing);
    });
  });

  group('My history', () {
    Widget host(FakeAdapter a) => MaterialApp(home: Scaffold(body: HistoryScreen(me: me, report: ReportApi(client(a)))));
    final month = me.today.substring(0, 7);

    testWidgets('this month: tiles and day rows', (t) async {
      final r = raw('report_me.json');
      (r['days'] as List).add({'day': '2026-11-01', 'sales': 4000, 'count': 1, 'commission': 400, 'expense': 0, 'net': 4000});
      final a = FakeAdapter({'GET /api/reports/me': (o) => r});
      await t.pumpWidget(host(a));
      await t.pumpAndSettle();
      expect(a.calls.single.queryParameters, {'month': month});
      expect(find.text(me.fmt.monthLabel(month)), findsOneWidget);
      expect(find.text('Sales'), findsOneWidget);
      expect(find.text('My commission'), findsOneWidget);
      expect(find.text('Sun 1 Nov'), findsOneWidget);
      expect(find.text('–'), findsWidgets);
      expect(find.text('All amounts in AED'), findsOneWidget);
      expect(t.widget<IconButton>(find.byKey(const ValueKey('next-month'))).onPressed, isNull);
    });

    testWidgets('month back asks for the previous month', (t) async {
      final a = FakeAdapter({'GET /api/reports/me': (o) => {...raw('report_me.json'), 'days': [], 'month': o.queryParameters['month']}});
      await t.pumpWidget(host(a));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('prev-month')));
      await t.pumpAndSettle();
      expect(a.calls.last.queryParameters['month'], prevMonth(month));
      expect(find.text('No sales this month'), findsOneWidget);
      expect(t.widget<IconButton>(find.byKey(const ValueKey('next-month'))).onPressed, isNotNull);
    });

    test('prevMonth / nextMonth roll the year', () {
      expect(prevMonth('2026-01'), '2025-12');
      expect(nextMonth('2025-12'), '2026-01');
      expect(prevMonth('2026-11'), '2026-10');
    });
  });
}
