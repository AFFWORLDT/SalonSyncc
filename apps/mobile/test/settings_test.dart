import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/data/settings_api.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/modules/settings/settings_screen.dart';

import 'support/fake_adapter.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
Me owner({List<String>? drop}) {
  final j = raw('me_owner_max.json') as Map<String, dynamic>;
  if (drop != null) j['features'] = (j['features'] as List).where((f) => !drop.contains(f)).toList();
  return Me.fromJson(j);
}

void main() {
  Future<(FakeAdapter, List<String>)> pump(WidgetTester t, {Me? me, Map<String, dynamic>? settings, Map<String, Handler> extra = const {}}) async {
    final loaded = settings ?? raw('settings.json') as Map<String, dynamic>;
    final a = FakeAdapter({
      'GET /api/settings': (o) => loaded,
      'PUT /api/settings': (o) => loaded,
      'GET /api/whatsapp/config': (o) => null,
      ...extra,
    });
    final out = <String>[];
    t.view.physicalSize = const Size(800, 6000);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      home: Scaffold(body: SettingsScreen(me: me ?? owner(), api: SettingsApi(ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a)), onSaved: () async => out.add('saved'))),
    ));
    await t.pumpAndSettle();
    return (a, out);
  }

  Map body(FakeAdapter a) => a.calls.singleWhere((c) => c.method == 'PUT' && c.path == '/api/settings').data as Map;

  testWidgets('save sends every key; untouched ones go back as loaded', (t) async {
    final loaded = raw('settings.json') as Map<String, dynamic>;
    final (a, out) = await pump(t);
    await t.enterText(find.byKey(const ValueKey('set-receipt_footer')), 'See you soon!');
    await t.tap(find.text('Save settings'));
    await t.pumpAndSettle();
    final b = body(a);
    expect(b.keys.toSet(), kSettingsInputKeys.toSet());
    expect(b['receipt_footer'], 'See you soon!');
    for (final k in kSettingsInputKeys.where((k) => k != 'receipt_footer')) {
      expect(b[k], loaded[k], reason: k);
    }
    expect(out, ['saved']);
    expect(find.text('Settings saved'), findsOneWidget);
  });

  testWidgets('VAT on shows the rate and TRN (UAE)', (t) async {
    await pump(t);
    expect(find.text('VAT %'), findsNothing);
    await t.tap(find.text('VAT on receipts'));
    await t.pumpAndSettle();
    expect(find.text('VAT %'), findsOneWidget);
    expect(find.text('TRN (15 digits)'), findsOneWidget);
  });

  testWidgets('quick amounts and sale-alert minimum are converted like the web', (t) async {
    final (a, _) = await pump(t);
    await t.enterText(find.byKey(const ValueKey('set-quick_amounts')), '20, 35 50');
    await t.enterText(find.byKey(const ValueKey('set-notify_sale_min')), '50');
    await t.tap(find.text('Save settings'));
    await t.pumpAndSettle();
    expect(body(a)['quick_amounts'], [20, 35, 50]);
    expect(body(a)['notify_sale_min'], 5000);
  });

  testWidgets('thank-you preview fills the tokens', (t) async {
    await pump(t);
    expect(find.textContaining('Thank you Ali for visiting E2E Salon! Your bill: AED 25.'), findsOneWidget);
  });

  testWidgets('WhatsApp Business only with the feature; connect form when not connected', (t) async {
    await pump(t, me: owner(drop: ['whatsapp']));
    expect(find.text('WhatsApp Business'), findsNothing);
    await pump(t);
    expect(find.text('WhatsApp Business'), findsOneWidget);
    expect(find.text('Connect your WhatsApp Business number'), findsOneWidget);
  });

  testWidgets('a server error is shown and nothing is lost', (t) async {
    final (_, out) = await pump(t, extra: {'PUT /api/settings': (o) => const FakeReply(400, {'error': 'Bill prefix must be 1 to 6 capital letters or digits'})});
    await t.enterText(find.byKey(const ValueKey('set-bill_prefix')), 'b-1');
    await t.tap(find.text('Save settings'));
    await t.pumpAndSettle();
    expect(find.text('Bill prefix must be 1 to 6 capital letters or digits'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'b-1'), findsOneWidget);
    expect(out, isEmpty);
  });
}
