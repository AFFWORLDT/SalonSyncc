import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:excel/excel.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/export/ledger_xlsx.dart';
import 'package:salonkit/core/format/fmt.dart';
import 'package:salonkit/data/ledger_api.dart';
import 'package:salonkit/models/ledger.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/modules/ledger/ledger_screen.dart';

import 'support/fake_adapter.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
final owner = Me.fromJson(raw('me_owner_max.json') as Map<String, dynamic>);

void main() {
  Future<(FakeAdapter, List<String>)> pump(WidgetTester t, {Map<String, Handler> extra = const {}}) async {
    final a = FakeAdapter({
      'GET /api/ledger/balances': (o) => raw('balances.json'),
      'PUT /api/ledger/balances': (o) => raw('balances.json'),
      'GET /api/ledger/shop': (o) => raw('ledger_shop.json'),
      'GET /api/ledger/barbers': (o) => raw('ledger_barbers.json'),
      'GET /api/ledger/barbers/67': (o) => raw('ledger_statement.json'),
      'GET /api/transfers': (o) => raw('transfers.json'),
      'POST /api/transfers': (o) => FakeReply(201, raw('transfer.json')),
      'PUT /api/transfers/1': (o) => raw('transfer.json'),
      'GET /api/payouts': (o) => raw('payouts.json'),
      'POST /api/payouts': (o) => FakeReply(201, raw('payout.json')),
      ...extra,
    });
    final out = <String>[];
    t.view.physicalSize = const Size(900, 3000);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: LedgerScreen(
          me: owner,
          api: LedgerApi(ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a)),
          shareFile: (Uint8List b, String name) async => out.add('file:$name'),
        ),
      ),
    ));
    await t.pumpAndSettle();
    return (a, out);
  }

  Iterable<Map<String, dynamic>> shopQueries(FakeAdapter a) => a.calls.where((c) => c.path == '/api/ledger/shop').map((c) => c.queryParameters);

  testWidgets('shop: tiles, opening, lines, closing; account filter', (t) async {
    final (a, _) = await pump(t);
    expect(find.text('Ledger'), findsOneWidget);
    expect(find.text('Every money movement, in order. Nothing here is ever rewritten.'), findsOneWidget);
    expect(find.text('Cash drawer'), findsWidgets);
    expect(find.text('AED -20'), findsWidgets);
    expect(find.text('AED 90'), findsWidgets);
    expect(find.text('Opening balance'), findsOneWidget);
    expect(find.text('Closing balance'), findsOneWidget);
    expect(find.textContaining('Bill E2E-20261104-001'), findsOneWidget);
    expect(shopQueries(a).first['account'], 'all');
    await t.tap(find.text('Cash + Bank'));
    await t.pumpAndSettle();
    await t.tap(find.text('Bank').last);
    await t.pumpAndSettle();
    expect(shopQueries(a).last['account'], 'bank');
  });

  testWidgets('move money: same account keeps the dialog with the server text', (t) async {
    await pump(t, extra: {'POST /api/transfers': (o) => FakeReply(400, raw('error_transfer_same.json'))});
    await t.tap(find.text('Move money'));
    await t.pumpAndSettle();
    expect(find.text('For example, depositing drawer cash into the bank. The shop total stays the same.'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('tx-amount')), '5');
    await t.tap(find.text('Save'));
    await t.pumpAndSettle();
    expect(find.text('Pick two different accounts'), findsOneWidget);
    expect(find.text('Move money').last, findsOneWidget);
  });

  testWidgets('move money: cash to bank, toast', (t) async {
    final (a, _) = await pump(t);
    await t.tap(find.text('Move money'));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const ValueKey('tx-amount')), '30');
    await t.enterText(find.byKey(const ValueKey('tx-note')), 'deposit at ENBD');
    await t.tap(find.text('Save'));
    await t.pumpAndSettle();
    expect(a.calls.singleWhere((c) => c.method == 'POST').data, {'amount': '30', 'from_account': 'cash', 'to_account': 'bank', 'day': owner.today, 'note': 'deposit at ENBD'});
    expect(find.text('Money moved'), findsOneWidget);
  });

  testWidgets('set balances accepts 0', (t) async {
    final (a, _) = await pump(t);
    await t.tap(find.text('Set balances'));
    await t.pumpAndSettle();
    expect(find.text('The ledger says AED -20'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('bal-cash')), '0');
    await t.enterText(find.byKey(const ValueKey('bal-bank')), '90');
    await t.tap(find.widgetWithText(FilledButton, 'Set balances'));
    await t.pumpAndSettle();
    expect(a.calls.singleWhere((c) => c.method == 'PUT').data, {'cash': '0', 'bank': '90'});
    expect(find.text('Balances set'), findsOneWidget);
  });

  testWidgets('tapping a money-move line opens it for editing', (t) async {
    await pump(t);
    await t.tap(find.text('Moved to bank'));
    await t.pumpAndSettle();
    expect(find.text('Edit money move'), findsOneWidget);
    expect(find.widgetWithText(TextField, '30'), findsOneWidget);
  });

  testWidgets('barbers: owed, statement, pay barber', (t) async {
    final (a, _) = await pump(t);
    await t.tap(find.text('Barbers'));
    await t.pumpAndSettle();
    expect(find.text('Owed to barbers'), findsOneWidget);
    expect(find.text('Commission earned minus payouts'), findsOneWidget);
    await t.tap(find.text('Barber Sam'));
    await t.pumpAndSettle();
    expect(find.text('Owed now'), findsOneWidget);
    expect(find.textContaining('Owed on '), findsOneWidget);
    await t.tap(find.text('Pay Barber Sam'));
    await t.pumpAndSettle();
    expect(find.text('Owed now: AED 14'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('po-amount')), '14');
    await t.tap(find.text('Save payout'));
    await t.pumpAndSettle();
    expect(a.calls.singleWhere((c) => c.method == 'POST').data, {'barber_id': 67, 'amount': '14', 'paid_from': 'cash', 'day': owner.today, 'note': ''});
    expect(find.text('Payout saved'), findsOneWidget);
  });

  testWidgets('Excel shares "{salon} ledger {from} to {to}.xlsx"', (t) async {
    final (_, out) = await pump(t);
    await t.tap(find.text('Excel'));
    await t.pumpAndSettle();
    expect(out.single, startsWith('file:E2E Salon ledger '));
  });

  test('xlsx: the web LEDGER layout', () {
    final l = ShopLedger.fromJson(raw('ledger_shop.json') as Map<String, dynamic>);
    final x = Excel.decodeBytes(buildLedgerXlsx(l, fmt: owner.fmt));
    final s = x.tables['LEDGER']!;
    expect(s.rows[0][0]?.value.toString(), 'Shop ledger · Cash + Bank · ${l.from} to ${l.to}');
    expect([for (final c in s.rows[2]) c?.value.toString()], ['Date', 'Time', 'Account', 'Type', 'Ref', 'Memo', 'In', 'Out', 'Balance']);
    expect(s.rows[3][3]?.value.toString(), 'Opening');
    expect(s.rows[4][5]?.value.toString(), l.lines.first.memo);
    expect(s.rows[4][6]?.value.toString(), '40');
  });
}
