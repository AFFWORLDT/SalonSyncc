import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/format/fmt.dart';
import 'package:salonkit/data/sales_api.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/models/sale.dart';
import 'package:salonkit/modules/sale/bill_screen.dart';

import 'support/fake_adapter.dart';
import 'support/harness.dart';
import 'support/me_fixture.dart';

Map<String, dynamic> raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync()) as Map<String, dynamic>;

void main() {
  tearDown(Get.reset);

  Future<void> pump(WidgetTester t, Map<String, dynamic> saleJson) async {
    final me = meWith(barber: true);
    final auth = putAuth(FakeAdapter({}));
    auth.salon.value = const SavedSalonForTest().salon;
    auth.me.value = me;
    final c = ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: FakeAdapter({}));
    await t.pumpWidget(MaterialApp(home: BillScreen(me: me, sales: SalesApi(c, me.fmt), sale: Sale.fromJson(saleJson))));
    await t.pumpAndSettle();
  }

  testWidgets("today's own bill can be edited", (t) async {
    final me = meWith(barber: true);
    await pump(t, {...raw('sale.json'), 'day': me.today, 'barber_id': me.user.id});
    expect(find.text('Edit'), findsOneWidget);
    expect(find.text('Share link'), findsOneWidget);
  });

  testWidgets("an admin can edit anyone's bill on any day", (t) async {
    final j = raw('me_owner_e2e.json');
    final me = Me.fromJson(j);
    final auth = putAuth(FakeAdapter({}));
    auth.salon.value = const SavedSalonForTest().salon;
    auth.me.value = me;
    final c = ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: FakeAdapter({}));
    await t.pumpWidget(MaterialApp(home: BillScreen(me: me, sales: SalesApi(c, me.fmt), sale: Sale.fromJson({...raw('sale.json'), 'day': '2020-01-01'}))));
    await t.pumpAndSettle();
    expect(find.text('Edit'), findsOneWidget);
  });

  testWidgets('an older bill is view-only', (t) async {
    final me = meWith(barber: true);
    await pump(t, {...raw('sale.json'), 'day': '2020-01-01', 'barber_id': me.user.id});
    expect(find.text('Edit'), findsNothing);
  });

  testWidgets('on a phone the bill shows, with the share buttons pinned under it (not filling the screen)', (t) async {
    t.view.physicalSize = const Size(1080, 2400);
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    final me = meWith(barber: true);
    await pump(t, {...raw('sale.json'), 'day': me.today, 'barber_id': me.user.id});
    expect(find.text('BILL').hitTestable(), findsOneWidget);
    final share = t.getRect(find.text('Share link'));
    expect(share.top, greaterThan(800 - 120)); // at the bottom of an 800-tall screen
    expect(t.getRect(find.text('BILL')).top, lessThan(share.top));
  });
}
