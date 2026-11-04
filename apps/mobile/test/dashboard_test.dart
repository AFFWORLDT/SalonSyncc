import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/data/admin_reports_api.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/modules/dashboard/dashboard_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fake_adapter.dart';

Map<String, dynamic> raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync()) as Map<String, dynamic>;

Me owner({List<String>? features}) {
  final j = raw('me_owner_e2e.json');
  if (features != null) j['features'] = features;
  return Me.fromJson(j);
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<FakeAdapter> pump(WidgetTester t, Me me, {Map<String, Handler> extra = const {}, Object? setup}) async {
    final a = FakeAdapter({
      'GET /api/reports/overview': (o) => o.queryParameters['from'] == o.queryParameters['to'] ? raw('overview.json') : raw('overview_range.json'),
      'GET /api/settings/setup': (o) => setup ?? raw('setup.json'),
      ...extra,
    });
    final c = ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a);
    t.view.physicalSize = const Size(800, 3200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      home: Scaffold(body: DashboardScreen(me: me, reports: AdminReportsApi(c), onOpenSale: (_) async {}, onAllSales: (_) {}, onDailySheet: () {})),
    ));
    await t.pumpAndSettle();
    return a;
  }

  testWidgets('today: tiles, delta, barbers and latest sales', (t) async {
    final me = owner();
    final a = await pump(t, me);
    expect(a.calls.first.queryParameters, {'from': me.today, 'to': me.today});
    expect(find.text('Dashboard'), findsOneWidget);
    expect(find.textContaining('Today, '), findsOneWidget);
    expect(find.text('Sales today'), findsOneWidget);
    expect(find.text('2 customers · +233% vs yesterday'), findsOneWidget);
    expect(find.text('incl. AED 200 company'), findsOneWidget);
    expect(find.text('Commission today'), findsOneWidget);
    expect(find.text('Profit today'), findsOneWidget);
    expect(find.text('AED -139'), findsOneWidget);
    expect(find.text('Barbers today'), findsOneWidget);
    expect(find.text('Barber Sam'), findsOneWidget);
    expect(find.text('Latest sales today'), findsOneWidget);
    expect(find.text('Kareem'), findsOneWidget);
  });

  testWidgets('no blur layers (smooth on low-end phones)', (t) async {
    await pump(t, owner());
    expect(find.byType(BackdropFilter), findsNothing);
  });

  testWidgets('a 320 dp phone still shows barber names', (t) async {
    await pump(t, owner());
    t.view.physicalSize = const Size(320, 3200);
    await t.pumpAndSettle();
    expect(t.takeException(), isNull);
    expect(t.getSize(find.text('Barber Sam')).width, greaterThanOrEqualTo(70));
  });

  testWidgets('range presets: only 1D without reports_advanced', (t) async {
    await pump(t, owner(features: ['core_sales', 'expenses', 'daily_sheet']));
    expect(find.text('1D'), findsOneWidget);
    expect(find.text('7D'), findsNothing);
  });

  testWidgets('7D asks from today−6 and shows the range', (t) async {
    final me = owner();
    final a = await pump(t, me);
    await t.tap(find.text('7D'));
    await t.pumpAndSettle();
    final q = a.calls.where((c) => c.path == '/api/reports/overview').last.queryParameters;
    final from = DateTime.parse(me.today).subtract(const Duration(days: 6));
    expect(q['from'], '${from.year}-${from.month.toString().padLeft(2, '0')}-${from.day.toString().padLeft(2, '0')}');
    expect(q['to'], me.today);
    expect(find.text('Sales in range'), findsOneWidget);
    expect(find.text('By day'), findsOneWidget);
  });

  testWidgets('no sales: empty text', (t) async {
    final empty = raw('overview.json')..['recent'] = [];
    await pump(t, owner(), extra: {'GET /api/reports/overview': (o) => empty});
    expect(find.text('No sales today.'), findsOneWidget);
  });

  testWidgets('setup checklist: steps, then dismissed for good', (t) async {
    await pump(t, owner());
    expect(find.text('Get your salon ready'), findsOneWidget);
    expect(find.text('2 of 5 done'), findsOneWidget);
    expect(find.text('Upload your salon logo'), findsOneWidget);
    await t.tap(find.byTooltip('Hide'));
    await t.pumpAndSettle();
    expect(find.text('Get your salon ready'), findsNothing);
    await pump(t, owner());
    expect(find.text('Get your salon ready'), findsNothing);
  });

  testWidgets('setup checklist hides when all is done', (t) async {
    await pump(t, owner(), setup: {'logo': true, 'services': true, 'staff': true, 'vat': true, 'google_review': true});
    expect(find.text('Get your salon ready'), findsNothing);
  });
}
