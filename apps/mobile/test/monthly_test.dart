import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:excel/excel.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/export/monthly_xlsx.dart';
import 'package:salonkit/core/format/fmt.dart';
import 'package:salonkit/data/monthly_api.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/models/monthly.dart';
import 'package:salonkit/modules/monthly/monthly_screen.dart';

import 'support/fake_adapter.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
final owner = Me.fromJson(raw('me_owner_max.json') as Map<String, dynamic>);

void main() {
  Future<(FakeAdapter, List<String>)> pump(WidgetTester t, {Object? data}) async {
    final a = FakeAdapter({'GET /api/reports/monthly': (o) => data ?? raw('monthly.json')});
    final out = <String>[];
    t.view.physicalSize = const Size(900, 2600);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: MonthlyScreen(
          me: owner,
          api: MonthlyApi(ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a)),
          onMonth: (m) => out.add('month:$m'),
          shareFile: (Uint8List b, String name) async => out.add('file:$name'),
        ),
      ),
    ));
    await t.pumpAndSettle();
    return (a, out);
  }

  testWidgets('year tiles, per barber, month by month', (t) async {
    final (a, out) = await pump(t);
    final year = owner.today.substring(0, 4);
    expect(a.calls.single.queryParameters, {'year': year});
    expect(find.text('Monthly'), findsOneWidget);
    expect(find.text('Sales $year'), findsOneWidget);
    expect(find.text('incl. AED 20 company'), findsOneWidget);
    expect(find.text('Per barber, $year'), findsOneWidget);
    expect(find.text('Month by month'), findsOneWidget);
    expect(find.text('All amounts in AED. Barber columns show sales.'), findsOneWidget);
    expect(t.widget<IconButton>(find.byKey(const ValueKey('next-year'))).onPressed, isNull);
    await t.tap(find.text('Nov'));
    expect(out, ['month:$year-11']);
  });

  testWidgets('empty year', (t) async {
    final m = raw('monthly.json') as Map<String, dynamic>;
    for (final r in m['months'] as List) {
      (r as Map)['cells'] = {};
      r['totals'] = {'sales': 0, 'count': 0, 'commission': 0, 'expense': 0, 'profit': 0, 'company_expense': 0};
    }
    await pump(t, data: m);
    expect(find.text('No records in ${owner.today.substring(0, 4)}.'), findsOneWidget);
  });

  testWidgets('Excel shares "{salon} {year} summary.xlsx"', (t) async {
    final (_, out) = await pump(t);
    await t.tap(find.text('Excel'));
    await t.pumpAndSettle();
    expect(out.single, 'file:E2E Salon ${owner.today.substring(0, 4)} summary.xlsx');
  });

  test('xlsx: the web summary layout', () {
    final r = MonthlyReport.fromJson(raw('monthly.json') as Map<String, dynamic>);
    final x = Excel.decodeBytes(buildMonthlyXlsx(r, fmt: owner.fmt));
    final s = x.tables['${r.year} SUMMARY']!;
    expect([for (final c in s.rows[0]) c?.value.toString()],
        ['Month', 'Barber Ali', 'Commission', 'Expense', 'Barber Sam', 'Commission', 'Expense', 'Total Sale', 'Expense', 'Total Commission', 'Total Profit']);
    expect(s.rows, hasLength(2)); // header + the one month with activity, no totals row
    expect(s.rows[1][0]?.value.toString(), 'November ${r.year}');
    expect(s.rows[1][7]?.value.toString(), '100');
  });
}
