import 'dart:convert';
import 'dart:io';

import 'package:excel/excel.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/export/daily_xlsx.dart';
import 'package:salonkit/core/format/fmt.dart';
import 'package:salonkit/data/admin_reports_api.dart';
import 'package:salonkit/models/daily_sheet.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/modules/sheet/sheet_screen.dart';
import 'package:salonkit/shell/nav.dart';

import 'support/fake_adapter.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
final owner = Me.fromJson(raw('me_owner_e2e.json') as Map<String, dynamic>);

void main() {
  Map<String, dynamic> withInactiveSam() {
    final d = raw('daily.json') as Map<String, dynamic>;
    ((d['barbers'] as List)[1] as Map)['active'] = false;
    return d;
  }

  Future<(FakeAdapter, List<String>)> pump(WidgetTester t, {Map<String, dynamic>? data}) async {
    final a = FakeAdapter({'GET /api/reports/daily': (o) => data ?? raw('daily.json')});
    final shared = <String>[];
    t.view.physicalSize = const Size(900, 2400);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SheetScreen(
          me: owner,
          reports: AdminReportsApi(ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a)),
          onDay: (d) => shared.add('day:$d'),
          shareFile: (bytes, name) async => shared.add('file:$name:${bytes.length}'),
        ),
      ),
    ));
    await t.pumpAndSettle();
    return (a, shared);
  }

  testWidgets('tiles, barber columns, totals; a date opens its sales', (t) async {
    final (a, shared) = await pump(t);
    expect(a.calls.single.queryParameters, {'month': owner.today.substring(0, 7)});
    expect(find.text('Daily sheet'), findsOneWidget);
    expect(find.text('Total sale'), findsOneWidget);
    expect(find.text('incl. AED 200 company'), findsOneWidget);
    expect(find.text('Total profit'), findsOneWidget);
    expect(find.text('Barber Ali'), findsOneWidget);
    expect(find.text('Barber Sam'), findsOneWidget);
    expect(find.text('Total'), findsOneWidget);
    expect(find.textContaining('Profit = sale − expense − commission'), findsOneWidget);
    await t.tap(find.text(owner.fmt.dayLabel(owner.today)));
    expect(shared, ['day:${owner.today}']);
  });

  testWidgets('no blur layers over the big table', (t) async {
    await pump(t);
    expect(find.byType(BackdropFilter), findsNothing);
  });

  testWidgets('opens on the month asked for (from Monthly)', (t) async {
    sheetMonthRequest.value = '2026-03';
    final (a, _) = await pump(t);
    expect(a.calls.single.queryParameters, {'month': '2026-03'});
    expect(sheetMonthRequest.value, isNull);
  });

  testWidgets('expense columns follow the switch', (t) async {
    await pump(t);
    expect(find.text('Exp.'), findsOneWidget);
    await t.tap(find.text("Show each barber's expense"));
    await t.pumpAndSettle();
    expect(find.text('Exp.'), findsNWidgets(3));
  });

  testWidgets('an inactive barber keeps a dimmed column', (t) async {
    await pump(t, data: withInactiveSam());
    final sam = t.widget<Text>(find.text('Barber Sam'));
    expect(sam.style?.color?.a, lessThan(1));
  });

  testWidgets('Excel builds the file and opens the share sheet', (t) async {
    final (_, shared) = await pump(t);
    await t.tap(find.text('Excel'));
    await t.pumpAndSettle();
    expect(shared.single, startsWith('file:E2E Salon November 2026.xlsx:'));
  });

  test('xlsx: the web layout — record sheet and EXPENSES', () {
    final d = DailySheet.fromJson(raw('daily.json') as Map<String, dynamic>);
    final bytes = buildDailyXlsx(d, salonName: 'E2E Salon', fmt: owner.fmt);
    final x = Excel.decodeBytes(bytes);
    expect(x.tables.keys, ['NOVEMBER 2026 SALE RECORD', 'EXPENSES']);
    final s = x.tables['NOVEMBER 2026 SALE RECORD']!;
    String v(int r, int c) => s.rows[r][c]?.value.toString() ?? '';
    expect([for (var c = 0; c < 10; c++) v(0, c)],
        ['Dates', 'Details', 'Barber Ali', 'Commission', 'Barber Sam', 'Commission', 'Total Sale', 'Expense', 'Total Commission', 'Total Profit']);
    expect(v(1, 1), 'SALE/COM'); // only the two days with activity
    expect(v(3, 1), 'TOTAL');
    expect(v(3, 6), '130');
    expect(v(3, 9), '-121');
    expect(v(5, 1), 'NOVEMBER 2026 SALE RECORD — E2E Salon');
    final e = x.tables['EXPENSES']!;
    expect([for (var c = 0; c < 5; c++) e.rows[0][c]?.value.toString()], ['Dates', 'Barber Ali', 'Barber Sam', 'Company', 'Total']);
    expect(e.rows[1][4]?.value.toString(), '215');
  });

  testWidgets('views: Shop shows only the shop columns; By barber shows one barber; the wide sheet says it scrolls', (t) async {
    t.view.physicalSize = const Size(1080, 2400);
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    await pump(t);
    expect(find.byKey(const ValueKey('swipe-hint')), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('view-shop')));
    await t.pumpAndSettle();
    expect(find.text('Barber Ali'), findsNothing);
    expect(find.text('Shop'), findsWidgets);
    await t.tap(find.byKey(const ValueKey('view-barber')));
    await t.pumpAndSettle();
    expect(find.text('Barber Ali'), findsWidgets); // the picker and the one column
    expect(find.text('Shop'), findsOneWidget); // only the view pill
  });

  test('file name drops characters a file system refuses', () => expect(workbookName('A/B: Salon', 'November 2026'), 'A B Salon November 2026.xlsx'));
}
