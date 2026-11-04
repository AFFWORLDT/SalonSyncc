import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/data/services_admin_api.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/modules/services/services_screen.dart';

import 'support/fake_adapter.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
Me owner({String currency = 'AED', int minor = 100}) {
  final j = raw('me_owner_max.json') as Map<String, dynamic>;
  (j['settings'] as Map)['currency'] = currency;
  (j['settings'] as Map)['currency_minor'] = minor;
  return Me.fromJson(j);
}

void main() {
  Future<FakeAdapter> pump(WidgetTester t, {Me? me, Object? list, Map<String, Handler> extra = const {}}) async {
    final a = FakeAdapter({
      'GET /api/services': (o) => list ?? raw('services_all.json'),
      'POST /api/services': (o) => FakeReply(201, (raw('services_all.json') as List).first),
      'PUT /api/services/157': (o) => (raw('services_all.json') as List).first,
      'DELETE /api/services/157': (o) => {'ok': true},
      'POST /api/services/starter': (o) => raw('services_all.json'),
      ...extra,
    });
    t.view.physicalSize = const Size(800, 2400);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ServicesScreen(me: me ?? owner(), api: ServicesAdminApi(ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a))))));
    await t.pumpAndSettle();
    return a;
  }

  testWidgets('groups with their services', (t) async {
    await pump(t);
    expect(find.text('Services'), findsOneWidget);
    expect(find.text('What barbers pick on a new sale, and what prints on the bill.'), findsOneWidget);
    expect(find.text('Hair'), findsOneWidget);
    expect(find.text('Care'), findsOneWidget);
    expect(find.text('Haircut'), findsOneWidget);
    expect(find.text('AED 40'), findsOneWidget);
  });

  testWidgets('empty: starter price list', (t) async {
    final a = await pump(t, list: []);
    expect(find.text('No services yet'), findsOneWidget);
    await t.tap(find.text('Add starter price list'));
    await t.pumpAndSettle();
    expect(a.calls.where((c) => c.path == '/api/services/starter'), hasLength(1));
    expect(find.text('Starter price list added. Edit the prices to match your salon.'), findsOneWidget);
  });

  testWidgets('hide sends the full service with the price in major units (3 decimals)', (t) async {
    final list = [
      {...(raw('services_all.json') as List).first as Map<String, dynamic>, 'price': 12345},
    ];
    final a = await pump(t, me: owner(currency: 'BHD', minor: 1000), list: list);
    await t.tap(find.byTooltip('Actions for Haircut'));
    await t.pumpAndSettle();
    await t.tap(find.text('Hide from new sales'));
    await t.pumpAndSettle();
    expect(a.calls.singleWhere((c) => c.method == 'PUT').data, {'category': 'Hair', 'name': 'Haircut', 'description': null, 'price': '12.345', 'sort_order': 1, 'active': false});
  });

  testWidgets('add: + Add pre-fills the group; POST; toast', (t) async {
    final a = await pump(t);
    await t.tap(find.byTooltip('Add to Care'));
    await t.pumpAndSettle();
    expect(find.text('Add service'), findsWidgets);
    expect(find.widgetWithText(TextField, 'Care'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('svc-name')), 'Head massage');
    await t.enterText(find.byKey(const ValueKey('svc-price')), '30');
    await t.tap(find.widgetWithText(FilledButton, 'Add service').last);
    await t.pumpAndSettle();
    final body = a.calls.singleWhere((c) => c.method == 'POST').data as Map;
    expect(body['category'], 'Care');
    expect(body['name'], 'Head massage');
    expect(body['price'], '30');
    expect(find.text('Head massage added'), findsOneWidget);
  });

  testWidgets('delete asks, then deletes', (t) async {
    final a = await pump(t);
    await t.tap(find.byTooltip('Actions for Haircut'));
    await t.pumpAndSettle();
    await t.tap(find.text('Delete'));
    await t.pumpAndSettle();
    expect(find.text('Delete Haircut?'), findsOneWidget);
    await t.tap(find.widgetWithText(FilledButton, 'Delete'));
    await t.pumpAndSettle();
    expect(a.calls.where((c) => c.method == 'DELETE'), hasLength(1));
    expect(find.text('Haircut deleted. Old bills keep it.'), findsOneWidget);
  });
}
