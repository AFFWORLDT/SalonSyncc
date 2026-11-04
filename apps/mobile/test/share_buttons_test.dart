import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/format/fmt.dart';
import 'package:salonkit/data/sales_api.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/models/sale.dart';
import 'package:salonkit/modules/sale/share_buttons.dart';

import 'support/fake_adapter.dart';
import 'support/me_fixture.dart';

Map<String, dynamic> raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync()) as Map<String, dynamic>;

Me meWa({required bool feature, required bool ready}) {
  final j = fx('me_barber.json');
  if (feature) j['features'] = [...j['features'] as List, 'whatsapp'];
  (j['settings'] as Map)['wa_ready'] = ready;
  (j['settings'] as Map)['display_name'] = 'E2E Salon';
  return Me.fromJson(j);
}

void main() {
  final sale = Sale.fromJson(raw('sale.json'));

  Future<(FakeAdapter, List<String>)> pump(WidgetTester t, Me me, {Sale? s}) async {
    final a = FakeAdapter({
      'POST /api/sales/17/whatsapp': (o) => {'id': 1, 'status': 'queued'},
      'GET /api/sales/17/whatsapp': (o) => {'id': 1, 'status': 'sent'},
    });
    final opened = <String>[];
    final c = ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a);
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ShareButtons(
          sale: s ?? sale,
          me: me,
          slug: 'e2esalon',
          sales: SalesApi(c, me.fmt),
          open: (u) async => opened.add(u),
          share: (text, subject) async => opened.add('share:$subject'),
        ),
      ),
    ));
    return (a, opened);
  }

  testWidgets('WhatsApp opens the customer chat; Share link opens the share sheet', (t) async {
    final (_, opened) = await pump(t, meWa(feature: false, ready: false));
    await t.tap(find.text('WhatsApp'));
    await t.tap(find.text('Share link'));
    await t.pump();
    expect(opened.first, startsWith('https://wa.me/971501234567?text='));
    expect(opened.last, 'share:Bill E2E-20261104-001 — E2E Salon');
    expect(find.text('Send from the salon number'), findsNothing);
  });

  testWidgets('salon WhatsApp: only with the feature, a connected number and a phone', (t) async {
    await pump(t, meWa(feature: true, ready: false));
    expect(find.text('Send from the salon number'), findsNothing);
    await pump(t, meWa(feature: true, ready: true), s: Sale.fromJson(raw('sale_walkin.json')));
    expect(find.text('Send from the salon number'), findsNothing);
    final (a, _) = await pump(t, meWa(feature: true, ready: true));
    await t.tap(find.text('Send from the salon number'));
    await t.pumpAndSettle();
    expect(find.text('Queued'), findsOneWidget);
    await t.pump(const Duration(milliseconds: 3600));
    await t.pumpAndSettle();
    expect(find.text('Sent'), findsOneWidget);
    expect(a.calls.map((c) => '${c.method} ${c.path}'), ['POST /api/sales/17/whatsapp', 'GET /api/sales/17/whatsapp']);
  });
}
