import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/format/fmt.dart';
import 'package:salonkit/data/sales_api.dart';
import 'package:salonkit/data/staff_api.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/modules/bills/bills_screen.dart';
import 'package:salonkit/modules/sales/sales_screen.dart';
import 'package:salonkit/shell/nav.dart';

import 'support/fake_adapter.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
final owner = Me.fromJson(raw('me_owner_e2e.json') as Map<String, dynamic>);
ApiClient client(FakeAdapter a) => ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a);

void main() {
  tearDown(() => salesDayRequest.value = null);

  Future<FakeAdapter> pump(WidgetTester t) async {
    final a = FakeAdapter({'GET /api/sales': (o) => raw('sales_admin_page.json'), 'GET /api/users': (o) => raw('users.json')});
    final c = client(a);
    await t.pumpWidget(MaterialApp(
      home: Scaffold(body: SalesScreen(me: owner, sales: SalesApi(c, owner.fmt), staff: StaffApi(c), onOpen: (_) async {}, onNewSale: () async {})),
    ));
    await t.pumpAndSettle();
    return a;
  }

  List<Map<String, dynamic>> salesQueries(FakeAdapter a) => [for (final c in a.calls.where((c) => c.path == '/api/sales')) c.queryParameters];

  testWidgets('all sales, then filtered by barber and payment', (t) async {
    final a = await pump(t);
    expect(find.text('Sales'), findsOneWidget);
    expect(find.text('All days'), findsOneWidget);
    expect(find.textContaining('3 sales · AED'), findsOneWidget);
    expect(find.textContaining('Barber Sam'), findsWidgets);
    await t.tap(find.text('All barbers'));
    await t.pumpAndSettle();
    await t.tap(find.text('Barber Sam').last);
    await t.pumpAndSettle();
    await t.tap(find.text('Cash + card'));
    await t.pumpAndSettle();
    await t.tap(find.text('Card').last);
    await t.pumpAndSettle();
    expect(salesQueries(a).last, {'barber_id': 37, 'payment_mode': 'card', 'page_size': 50});
  });

  testWidgets('a day asked for from elsewhere filters the list', (t) async {
    salesDayRequest.value = '2026-11-03';
    final a = await pump(t);
    expect(salesQueries(a).first, {'day': '2026-11-03', 'page_size': 50});
    expect(find.text(owner.fmt.dayLabel('2026-11-03')), findsOneWidget);
    await t.tap(find.byTooltip('All days'));
    await t.pumpAndSettle();
    expect(salesQueries(a).last, {'page_size': 50});
  });

  testWidgets('admin bills: heading, barber on rows, empty text', (t) async {
    final a = FakeAdapter({'GET /api/sales': (o) => raw('sales_admin_page.json')});
    await t.pumpWidget(MaterialApp(home: Scaffold(body: BillsScreen(me: owner, sales: SalesApi(client(a), owner.fmt), onOpen: (_) async {}, admin: true))));
    await t.pumpAndSettle();
    expect(find.text('Bills'), findsOneWidget);
    expect(find.text('Every sale makes a bill. Open one to see or print it.'), findsOneWidget);
    expect(find.textContaining('Barber Sam'), findsWidgets);
    final e = FakeAdapter({'GET /api/sales': (o) => {'items': [], 'total': 0, 'page': 1, 'page_size': 50, 'sum': 0}});
    await t.pumpWidget(MaterialApp(home: Scaffold(body: BillsScreen(key: const ValueKey('empty'), me: owner, sales: SalesApi(client(e), owner.fmt), onOpen: (_) async {}, admin: true))));
    await t.pumpAndSettle();
    expect(find.text('No bills match.'), findsOneWidget);
  });
}
