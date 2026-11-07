import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/format/fmt.dart';
import 'package:salonkit/data/sales_api.dart';
import 'package:salonkit/models/sale.dart';
import 'package:salonkit/modules/sale/sale_sheet.dart';

import 'support/fake_adapter.dart';
import 'support/me_fixture.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
final me = meWith(barber: true);

Widget host(FakeAdapter a, {Sale? edit, int Function()? now}) {
  final c = ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 'skm_t', adapter: a);
  return MaterialApp(home: SaleSheet(me: me, sales: SalesApi(c, me.fmt), existing: edit, now: now));
}

Map<String, Handler> base() => {'GET /api/services': (o) => raw('services.json'), 'GET /api/customers': (o) => raw('customers.json')};

Future<void> toCustomer(WidgetTester t) async {
  await t.tap(find.byKey(const ValueKey('next')));
  await t.pumpAndSettle();
}

List<dynamic> posts(FakeAdapter a) => a.calls.where((c) => c.method == 'POST').toList();

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
  testWidgets('tapping a service twice makes qty 2 and the total follows', (t) async {
    await pumpHost(t, host(FakeAdapter(base())));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('service-109')));
    await t.pump();
    await t.tap(find.byKey(const ValueKey('service-109')));
    await t.pumpAndSettle();
    expect(find.text('× 2 = AED 80'), findsOneWidget);
    expect(totalText(t), 'AED 80');
    await t.tap(find.byKey(const ValueKey('minus-0')));
    await t.pumpAndSettle();
    expect(totalText(t), 'AED 40');
  });

  testWidgets('categories: chips of the chosen one', (t) async {
    await pumpHost(t, host(FakeAdapter(base())));
    await t.pumpAndSettle();
    expect(find.text('Face mask'), findsNothing);
    await t.tap(find.text('Care'));
    await t.pumpAndSettle();
    expect(find.text('Face mask'), findsOneWidget);
  });

  testWidgets('amount only, cash: saves and shows the bill', (t) async {
    final a = FakeAdapter({...base(), 'POST /api/sales': (o) => FakeReply(201, raw('sale_walkin.json'))});
    await pumpHost(t, host(a));
    await t.pumpAndSettle();
    await typeAmount(t, '25');
    await t.pumpAndSettle();
    await toCustomer(t);
    await t.tap(find.text('Cash'));
    await t.tap(find.byKey(const ValueKey('save')));
    await t.pumpAndSettle();
    expect(posts(a).single.data, {'amount': '25', 'payment_mode': 'cash', 'customer_name': null, 'customer_phone': null, 'note': null});
    expect(find.text('Congrats! Bill generated'), findsOneWidget);
    expect(find.text('E2E-20261104-002'), findsOneWidget);
  });

  testWidgets('quick amounts fill the amount', (t) async {
    await pumpHost(t, host(FakeAdapter(base())));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('quick-35')));
    await t.pumpAndSettle();
    expect(totalText(t), 'AED 35');
  });

  testWidgets('Next stays off until there is a total', (t) async {
    await pumpHost(t, host(FakeAdapter(base())));
    await t.pumpAndSettle();
    expect(t.widget<InkWell>(find.byKey(const ValueKey('next'))).onTap, isNull);
  });

  testWidgets('customer and phone are sent as the server stores them', (t) async {
    final a = FakeAdapter({...base(), 'POST /api/sales': (o) => FakeReply(201, raw('sale.json'))});
    await pumpHost(t, host(a));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('service-109')));
    await t.pumpAndSettle();
    await toCustomer(t);
    await t.enterText(find.byKey(const ValueKey('customer-name')), 'Omar');
    await t.enterText(find.byKey(const ValueKey('customer-phone')), '0501234567');
    await t.tap(find.text('Card'));
    await t.tap(find.text('More (note)'));
    await t.pumpAndSettle();
    await t.ensureVisible(find.byKey(const ValueKey('note')));
    await t.enterText(find.byKey(const ValueKey('note')), 'Regular');
    await t.tap(find.byKey(const ValueKey('save')));
    await t.pumpAndSettle();
    expect(posts(a).single.data, {
      'items': [
        {'service_id': 109, 'price': '40', 'qty': 1},
      ],
      'payment_mode': 'card',
      'customer_name': 'Omar',
      'customer_phone': '0501234567',
      'note': 'Regular',
    });
  });

  testWidgets('a bad phone is caught before saving', (t) async {
    final a = FakeAdapter({...base(), 'POST /api/sales': (o) => FakeReply(201, raw('sale.json'))});
    await pumpHost(t, host(a));
    await t.pumpAndSettle();
    await typeAmount(t, '25');
    await t.pumpAndSettle();
    await toCustomer(t);
    await t.enterText(find.byKey(const ValueKey('customer-phone')), '12');
    await t.tap(find.text('Cash'));
    await t.tap(find.byKey(const ValueKey('save')));
    await t.pumpAndSettle();
    expect(find.text("Mobile number doesn't look right"), findsOneWidget);
    expect(posts(a), isEmpty);
  });

  testWidgets('a suggestion fills name and phone', (t) async {
    await pumpHost(t, host(FakeAdapter(base())));
    await t.pumpAndSettle();
    await typeAmount(t, '25');
    await t.pumpAndSettle();
    await toCustomer(t);
    await t.tap(find.widgetWithText(ActionChip, 'Omar'));
    await t.pumpAndSettle();
    expect(find.widgetWithText(TextField, 'Omar'), findsOneWidget);
    expect(find.widgetWithText(TextField, '0501234567'), findsOneWidget);
  });

  testWidgets('double tap saves once', (t) async {
    final hold = Completer<Object?>();
    final a = FakeAdapter({...base(), 'POST /api/sales': (o) => hold.future});
    await pumpHost(t, host(a));
    await t.pumpAndSettle();
    await typeAmount(t, '25');
    await t.pumpAndSettle();
    await toCustomer(t);
    await t.tap(find.text('Cash'));
    await t.tap(find.byKey(const ValueKey('save')));
    await t.tap(find.byKey(const ValueKey('save')), warnIfMissed: false);
    await t.pump();
    hold.complete(FakeReply(201, raw('sale_walkin.json')));
    await t.pumpAndSettle();
    expect(posts(a), hasLength(1));
  });

  testWidgets('a server error shows its text and keeps the input', (t) async {
    final a = FakeAdapter({...base(), 'POST /api/sales': (o) => FakeReply(400, raw('error_400.json'))});
    await pumpHost(t, host(a));
    await t.pumpAndSettle();
    await typeAmount(t, '25');
    await t.pumpAndSettle();
    await toCustomer(t);
    await t.enterText(find.byKey(const ValueKey('customer-name')), 'Sam');
    await t.tap(find.text('Cash'));
    await t.tap(find.byKey(const ValueKey('save')));
    await t.pumpAndSettle();
    expect(find.text('Pick a service or enter the amount (e.g. 25)'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Sam'), findsOneWidget);
  });

  testWidgets('offline save says so and keeps the sheet', (t) async {
    final a = FakeAdapter({...base(), 'POST /api/sales': (o) => throw offline(o)});
    await pumpHost(t, host(a));
    await t.pumpAndSettle();
    await typeAmount(t, '25');
    await t.pumpAndSettle();
    await toCustomer(t);
    await t.tap(find.text('Cash'));
    await t.tap(find.byKey(const ValueKey('save')));
    await t.pumpAndSettle();
    expect(find.text("You're offline"), findsOneWidget);
    expect(find.byKey(const ValueKey('save')), findsOneWidget);
  });

  testWidgets('a save that timed out but landed is found, not saved twice', (t) async {
    final landed = {...raw('sale_walkin.json') as Map<String, dynamic>, 'barber_id': me.user.id};
    final a = FakeAdapter({
      ...base(),
      'POST /api/sales': (o) => throw DioException(requestOptions: o, type: DioExceptionType.receiveTimeout),
      'GET /api/sales': (o) => {'items': [landed], 'total': 1, 'page': 1, 'page_size': 200, 'sum': 2500},
    });
    await pumpHost(t, host(a, now: () => landed['created_at'] as int));
    await t.pumpAndSettle();
    await typeAmount(t, '25');
    await t.pumpAndSettle();
    await toCustomer(t);
    await t.tap(find.text('Cash'));
    await t.tap(find.byKey(const ValueKey('save')));
    await t.pumpAndSettle();
    expect(find.text("You're offline"), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('save')));
    await t.pumpAndSettle();
    expect(posts(a), hasLength(1));
    expect(find.text('Congrats! Bill generated'), findsOneWidget);
    expect(find.text('E2E-20261104-002'), findsOneWidget);
  });

  testWidgets('a timed-out save that did not land is saved on retry', (t) async {
    var n = 0;
    final a = FakeAdapter({
      ...base(),
      'POST /api/sales': (o) => n++ == 0 ? throw DioException(requestOptions: o, type: DioExceptionType.receiveTimeout) : FakeReply(201, raw('sale_walkin.json')),
      'GET /api/sales': (o) => {'items': [], 'total': 0, 'page': 1, 'page_size': 200, 'sum': 0},
    });
    await pumpHost(t, host(a));
    await t.pumpAndSettle();
    await typeAmount(t, '25');
    await t.pumpAndSettle();
    await toCustomer(t);
    await t.tap(find.text('Cash'));
    await t.tap(find.byKey(const ValueKey('save')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('save')));
    await t.pumpAndSettle();
    expect(posts(a), hasLength(2));
    expect(find.text('Congrats! Bill generated'), findsOneWidget);
  });

  group('edit', () {
    final sale = Sale.fromJson(raw('sale.json') as Map<String, dynamic>);

    testWidgets('prefills and saves with PUT', (t) async {
      final a = FakeAdapter({...base(), 'PUT /api/sales/17': (o) => raw('sale.json')});
      await pumpHost(t, host(a, edit: sale));
      await t.pumpAndSettle();
      expect(find.text('Edit E2E-20261104-001'), findsOneWidget);
      expect(totalText(t), 'AED 65');
      await toCustomer(t);
      expect(find.widgetWithText(TextField, 'Omar'), findsOneWidget);
      await t.tap(find.byKey(const ValueKey('save')));
      await t.pumpAndSettle();
      final put = a.calls.singleWhere((c) => c.method == 'PUT');
      expect((put.data as Map)['items'], [
        {'service_id': 109, 'price': '40', 'qty': 1},
        {'name': 'Hair oil', 'price': '12.5', 'qty': 2},
      ]);
      expect((put.data as Map)['payment_mode'], 'card');
    });

    testWidgets('stale keeps input', (t) async {
      final a = FakeAdapter({
        ...base(),
        'PUT /api/sales/17': (o) => const FakeReply(409, {'error': 'This sale was changed by someone else. Reload and try again.', 'code': 'stale'}),
      });
      await pumpHost(t, host(a, edit: sale));
      await t.pumpAndSettle();
      await toCustomer(t);
      await t.enterText(find.byKey(const ValueKey('customer-name')), 'Omar K');
      await t.tap(find.byKey(const ValueKey('save')));
      await t.pumpAndSettle();
      expect(find.text('This sale was changed by someone else. Reload and try again.'), findsOneWidget);
      expect(find.widgetWithText(TextField, 'Omar K'), findsOneWidget);
    });

    testWidgets('delete asks first, then deletes', (t) async {
      final a = FakeAdapter({...base(), 'DELETE /api/sales/17': (o) => {'ok': true}});
      await pumpHost(t, host(a, edit: sale));
      await t.pumpAndSettle();
      await t.tap(find.byTooltip('Delete bill'));
      await t.pumpAndSettle();
      expect(find.text('Delete this sale?'), findsOneWidget);
      await t.tap(find.text('Cancel'));
      await t.pumpAndSettle();
      expect(a.calls.where((c) => c.method == 'DELETE'), isEmpty);
      await t.tap(find.byTooltip('Delete bill'));
      await t.pumpAndSettle();
      await t.tap(find.text('Delete'));
      await t.pumpAndSettle();
      expect(a.calls.where((c) => c.method == 'DELETE'), hasLength(1));
    });
  });
}
