import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
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

Widget host(FakeAdapter a, {Sale? edit, int Function()? now}) {
  final c = ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a);
  return MaterialApp(home: SaleSheet(me: owner, sales: SalesApi(c, owner.fmt), staff: StaffApi(c), existing: edit, now: now));
}

Map<String, Handler> base() => {
      'GET /api/services': (o) => raw('services.json'),
      'GET /api/customers': (o) => raw('customers.json'),
      'GET /api/users': (o) => raw('users.json'),
    };

/// A phone-sized screen (360×800), like the devices the sheet is made for.
Future<void> pumpHost(WidgetTester t, Widget w) async {
  t.view.physicalSize = const Size(1080, 2400);
  t.view.devicePixelRatio = 3;
  addTearDown(t.view.reset);
  await t.pumpWidget(w);
}

/// Types on the sheet's number pad.
Future<void> typeAmount(WidgetTester t, String v) async {
  for (final c in v.split('')) {
    await t.tap(find.byKey(ValueKey('pad-$c')));
    await t.pump();
  }
  await t.pumpAndSettle();
}

String totalText(WidgetTester t) => t.widget<Text>(find.byKey(const ValueKey('total'))).data!;

/// Picks a barber; the sheet moves on to the services by itself.
Future<void> pickBarber(WidgetTester t, String name) async {
  await t.tap(find.text(name));
  await t.pump(const Duration(milliseconds: 250));
  await t.pumpAndSettle();
}

void main() {
  testWidgets('admin picks barber and day', (t) async {
    final a = FakeAdapter({...base(), 'POST /api/sales': (o) => FakeReply(201, raw('sale_admin.json'))});
    await pumpHost(t, host(a));
    await t.pumpAndSettle();
    expect(find.text('Who did this customer?'), findsOneWidget);
    expect(find.text('Owner ★'), findsOneWidget);
    expect(find.byKey(const ValueKey('next')), findsNothing);
    await pickBarber(t, 'Barber Sam');
    await typeAmount(t, '60');
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

  testWidgets("a timed-out save for another barber that landed is found, not saved twice", (t) async {
    final landed = raw('sale_admin.json') as Map<String, dynamic>; // Barber Sam (37), card, AED 60
    final a = FakeAdapter({
      ...base(),
      'POST /api/sales': (o) => throw DioException(requestOptions: o, type: DioExceptionType.receiveTimeout),
      'GET /api/sales': (o) => {'items': [landed], 'total': 1, 'page': 1, 'page_size': 200, 'sum': 6000},
    });
    await pumpHost(t, host(a, now: () => landed['created_at'] as int));
    await t.pumpAndSettle();
    await pickBarber(t, 'Barber Sam');
    await typeAmount(t, '60');
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('next')));
    await t.pumpAndSettle();
    await t.tap(find.text('Card'));
    await t.tap(find.byKey(const ValueKey('save')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('save')));
    await t.pumpAndSettle();
    expect(a.calls.where((c) => c.method == 'POST'), hasLength(1));
    expect(find.text('Congrats! Bill generated'), findsOneWidget);
  });

  testWidgets('today is not sent as a day', (t) async {
    final a = FakeAdapter({...base(), 'POST /api/sales': (o) => FakeReply(201, raw('sale_admin.json'))});
    await pumpHost(t, host(a));
    await t.pumpAndSettle();
    await pickBarber(t, 'Barber Ali');
    await typeAmount(t, '40');
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
    await pumpHost(t, host(a, edit: sale));
    await t.pumpAndSettle();
    expect(find.text('Edit E2E-20261104-002'), findsOneWidget);
    // Editing opens on the services; the barber is a tap away in the steps.
    await t.tap(find.byKey(const ValueKey('tab-barber')));
    await t.pumpAndSettle();
    await pickBarber(t, 'Barber Ali');
    await t.tap(find.byKey(const ValueKey('next')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('save')));
    await t.pumpAndSettle();
    final body = a.calls.singleWhere((c) => c.method == 'PUT').data as Map;
    expect(body['barber_id'], 36);
    expect(body['day'], sale.day);
  });
}
