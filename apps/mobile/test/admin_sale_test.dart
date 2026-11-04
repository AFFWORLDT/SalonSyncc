import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/format/fmt.dart';
import 'package:salonkit/data/sales_api.dart';
import 'package:salonkit/data/staff_api.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/models/sale.dart';
import 'package:salonkit/modules/sale/sale_sheet.dart';

import 'support/fake_adapter.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
final owner = Me.fromJson(raw('me_owner_e2e.json') as Map<String, dynamic>);

Widget host(FakeAdapter a, {Sale? edit}) {
  final c = ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a);
  return MaterialApp(home: SaleSheet(me: owner, sales: SalesApi(c, owner.fmt), staff: StaffApi(c), existing: edit));
}

Map<String, Handler> base() => {
      'GET /api/services': (o) => raw('services.json'),
      'GET /api/customers': (o) => raw('customers.json'),
      'GET /api/users': (o) => raw('users.json'),
    };

void main() {
  testWidgets('admin picks barber and day', (t) async {
    final a = FakeAdapter({...base(), 'POST /api/sales': (o) => FakeReply(201, raw('sale_admin.json'))});
    await t.pumpWidget(host(a));
    await t.pumpAndSettle();
    expect(find.text('Who did this customer?'), findsOneWidget);
    expect(find.text('Owner ★'), findsOneWidget);
    expect(t.widget<FilledButton>(find.byKey(const ValueKey('next'))).onPressed, isNull);
    await t.tap(find.text('Barber Sam'));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('next')));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const ValueKey('amount')), '60');
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('next')));
    await t.pumpAndSettle();
    await t.tap(find.text('Card'));
    await t.tap(find.text('More (day, note)'));
    await t.pumpAndSettle();
    expect(find.text('Change only to enter a missed sale'), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('sale-day')));
    await t.pumpAndSettle();
    final yesterday = DateTime.parse(owner.today).subtract(const Duration(days: 1));
    await t.tap(find.text('${yesterday.day}').last);
    await t.tap(find.text('OK'));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('save')));
    await t.pumpAndSettle();
    final body = a.calls.singleWhere((c) => c.method == 'POST').data as Map;
    expect(body['barber_id'], 37);
    expect(body['day'], '${yesterday.year}-${yesterday.month.toString().padLeft(2, '0')}-${yesterday.day.toString().padLeft(2, '0')}');
    expect(body['amount'], '60');
  });

  testWidgets('today is not sent as a day', (t) async {
    final a = FakeAdapter({...base(), 'POST /api/sales': (o) => FakeReply(201, raw('sale_admin.json'))});
    await t.pumpWidget(host(a));
    await t.pumpAndSettle();
    await t.tap(find.text('Barber Ali'));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('next')));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const ValueKey('amount')), '40');
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('next')));
    await t.pumpAndSettle();
    await t.tap(find.text('Cash'));
    await t.tap(find.byKey(const ValueKey('save')));
    await t.pumpAndSettle();
    final body = a.calls.singleWhere((c) => c.method == 'POST').data as Map;
    expect(body['barber_id'], 36);
    expect(body.containsKey('day'), isFalse);
  });

  testWidgets('admin edit: prefilled barber, change it, PUT carries it', (t) async {
    final sale = Sale.fromJson(raw('sale_admin.json') as Map<String, dynamic>);
    final a = FakeAdapter({...base(), 'PUT /api/sales/25': (o) => raw('sale_admin.json')});
    await t.pumpWidget(host(a, edit: sale));
    await t.pumpAndSettle();
    expect(find.text('Edit E2E-20261104-002'), findsOneWidget);
    await t.tap(find.text('Barber Ali'));
    await t.pumpAndSettle();
    for (var i = 0; i < 2; i++) {
      await t.tap(find.byKey(const ValueKey('next')));
      await t.pumpAndSettle();
    }
    await t.tap(find.byKey(const ValueKey('save')));
    await t.pumpAndSettle();
    final body = a.calls.singleWhere((c) => c.method == 'PUT').data as Map;
    expect(body['barber_id'], 36);
    expect(body['day'], sale.day);
  });
}
