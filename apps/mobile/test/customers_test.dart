import 'package:salonkit/core/ui/toggle.dart';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/data/customers_api.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/modules/customers/customers_screen.dart';

import 'support/fake_adapter.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
Me owner({bool whatsapp = true}) {
  final j = raw('me_owner_max.json') as Map<String, dynamic>;
  if (!whatsapp) j['features'] = (j['features'] as List).where((f) => f != 'whatsapp').toList();
  return Me.fromJson(j);
}

void main() {
  FakeAdapter adapter([Map<String, Handler> extra = const {}]) => FakeAdapter({
        'GET /api/customers': (o) => raw('customers_admin.json'),
        'GET /api/customers/3': (o) => raw('customer_detail.json'),
        'PUT /api/customers/3/whatsapp': (o) => {...raw('customer_detail.json') as Map<String, dynamic>, 'wa_opt_out': true},
        'GET /api/sales': (o) => raw('sales_page.json'),
        ...extra,
      });
  ApiClient client(FakeAdapter a) => ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a);

  Future<void> big(WidgetTester t) async {
    t.view.physicalSize = const Size(800, 2400);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
  }

  testWidgets('list: header, rows, search debounced', (t) async {
    await big(t);
    final a = adapter();
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CustomersScreen(me: owner(), api: CustomersApi(client(a)), onOpen: (_) async {}))));
    await t.pumpAndSettle();
    expect(find.text('Customers'), findsOneWidget);
    expect(find.text('Saved automatically when a barber enters a mobile number. Tap one for their visit history.'), findsOneWidget);
    expect(find.text('1 customers'), findsOneWidget);
    expect(find.text('Omar'), findsOneWidget);
    await t.enterText(find.byType(TextField), 'om');
    await t.pump(const Duration(milliseconds: 300));
    await t.pumpAndSettle();
    expect(a.calls.last.queryParameters, {'q': 'om', 'page_size': 50});
  });

  testWidgets('list: empty texts', (t) async {
    await big(t);
    final a = adapter({'GET /api/customers': (o) => {'items': [], 'total': 0, 'page': 1, 'page_size': 50}});
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CustomersScreen(me: owner(), api: CustomersApi(client(a)), onOpen: (_) async {}))));
    await t.pumpAndSettle();
    expect(find.text('No customers yet.'), findsOneWidget);
    await t.enterText(find.byType(TextField), 'zzz');
    await t.pump(const Duration(milliseconds: 300));
    await t.pumpAndSettle();
    expect(find.text('No match.'), findsOneWidget);
  });

  testWidgets('profile: tiles, chips, visits, WhatsApp opt-out', (t) async {
    await big(t);
    final a = adapter();
    await t.pumpWidget(MaterialApp(home: CustomerProfile(me: owner(), api: CustomersApi(client(a)), id: 3, onOpenSale: (_) async {})));
    await t.pumpAndSettle();
    expect(find.text('Omar'), findsWidgets);
    expect(find.text('Visits'), findsOneWidget);
    expect(find.text('1 cash · 0 card'), findsOneWidget);
    expect(find.text('Total spent'), findsOneWidget);
    expect(find.text('Average bill'), findsOneWidget);
    expect(find.text('Haircut ×1'), findsOneWidget);
    expect(find.text('Visit history'), findsOneWidget);
    expect(a.calls.where((c) => c.path == '/api/sales').single.queryParameters, {'customer_id': 3, 'page_size': 30});
    await t.tap(find.byType(SkToggle));
    await t.pumpAndSettle();
    expect(a.calls.singleWhere((c) => c.method == 'PUT').data, {'opt_out': true});
    expect(find.text('No more WhatsApp reminders or announcements'), findsOneWidget);
  });

  testWidgets('profile: no WhatsApp card without the feature', (t) async {
    await big(t);
    await t.pumpWidget(MaterialApp(home: CustomerProfile(me: owner(whatsapp: false), api: CustomersApi(client(adapter())), id: 3, onOpenSale: (_) async {})));
    await t.pumpAndSettle();
    expect(find.text('WhatsApp reminders and announcements'), findsNothing);
  });
}
