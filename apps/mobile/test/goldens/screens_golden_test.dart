// Stage F: what the key screens look like, light and dark, at a 360 x 800 phone, drawn with the app's real fonts and
// icons. `flutter test --update-goldens test/goldens` redraws them after a deliberate change; otherwise a screen that
// changes by accident fails here. Tagged `golden`: fonts render slightly differently per OS, so CI can skip them.
@Tags(['golden'])
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/format/fmt.dart';
import 'package:salonkit/core/theme/app_theme.dart';
import 'package:salonkit/core/theme/tokens.dart';
import 'package:salonkit/data/admin_reports_api.dart';
import 'package:salonkit/data/customers_api.dart';
import 'package:salonkit/data/report_api.dart';
import 'package:salonkit/data/sales_api.dart';
import 'package:salonkit/data/services_admin_api.dart';
import 'package:salonkit/data/settings_api.dart';
import 'package:salonkit/data/staff_api.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/models/sale.dart';
import 'package:salonkit/modules/customers/customers_screen.dart';
import 'package:salonkit/modules/dashboard/dashboard_screen.dart';
import 'package:salonkit/modules/sale/bill_view.dart';
import 'package:salonkit/modules/sale/sale_done.dart';
import 'package:salonkit/modules/sales/sales_screen.dart';
import 'package:salonkit/modules/services/services_screen.dart';
import 'package:salonkit/modules/settings/settings_screen.dart';
import 'package:salonkit/modules/sheet/sheet_screen.dart';
import 'package:salonkit/modules/staff/staff_screen.dart';
import 'package:salonkit/modules/today/today_screen.dart';

import '../support/fake_adapter.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
final owner = Me.fromJson(raw('me_owner_max.json') as Map<String, dynamic>);

Future<void> _font(String family, List<String> files) async {
  final l = FontLoader(family);
  for (final f in files) {
    l.addFont(Future.value(ByteData.sublistView(File(f).readAsBytesSync())));
  }
  await l.load();
}

void main() {
  setUpAll(() async {
    await _font('GoogleSansFlex', [for (final w in [400, 500, 600, 700]) 'assets/fonts/GoogleSansFlex-$w.ttf']);
    await _font('GoogleSansCode', [for (final w in [400, 500, 600]) 'assets/fonts/GoogleSansCode-$w.ttf']);
    final flutterRoot = File(Platform.resolvedExecutable).parent.parent.parent.parent.parent.parent.path;
    final icons = File('$flutterRoot/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf');
    if (icons.existsSync()) await _font('MaterialIcons', [icons.path]);
  });

  final a = FakeAdapter({
    'GET /api/sales': (o) => raw('sales_admin_page.json'),
    'GET /api/users': (o) => raw('users.json'),
    'GET /api/services': (o) => raw('services_all.json'),
    'GET /api/customers': (o) => raw('customers_admin.json'),
    'GET /api/settings': (o) => raw('settings.json'),
    'GET /api/whatsapp/config': (o) => null,
    'GET /api/reports/overview': (o) => raw('overview.json'),
    'GET /api/settings/setup': (o) => raw('setup.json'),
    'GET /api/reports/daily': (o) => raw('daily.json'),
    'GET /api/reports/me': (o) => raw('report_me.json'),
  });
  final c = ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a);
  final sale = Sale.fromJson(raw('sale.json') as Map<String, dynamic>);

  final screens = <String, Widget Function()>{
    'dashboard': () => DashboardScreen(me: owner, reports: AdminReportsApi(c), onOpenSale: (_) async {}, onAllSales: (_) {}, onDailySheet: () {}, onNewSale: () async {}),
    'today': () => TodayScreen(me: owner, sales: SalesApi(c, owner.fmt), report: ReportApi(c), onNewSale: () async {}, onOpenSale: (_) async {}),
    'sales': () => SalesScreen(me: owner, sales: SalesApi(c, owner.fmt), staff: StaffApi(c), onOpen: (_) async {}, onNewSale: () async {}),
    'daily-sheet': () => SheetScreen(me: owner, reports: AdminReportsApi(c), onDay: (_) {}),
    'staff': () => StaffScreen(me: owner, api: StaffApi(c)),
    'services': () => ServicesScreen(me: owner, api: ServicesAdminApi(c)),
    'customers': () => CustomersScreen(me: owner, api: CustomersApi(c), onOpen: (_) async {}),
    'settings': () => SettingsScreen(me: owner, api: SettingsApi(c), onSaved: () async {}),
    'bill': () => ListView(padding: const EdgeInsets.all(16), children: [BillView(sale: sale, settings: owner.salon, fmt: owner.fmt)]),
    'sale-done': () => SaleDone(sale: sale, fmt: owner.fmt, settings: owner.salon, slug: owner.org.slug, onDone: () {}, onNew: () {}),
  };

  for (final e in screens.entries) {
    for (final dark in [false, true]) {
      final name = '${e.key}-${dark ? 'dark' : 'light'}';
      testWidgets(name, (t) async {
        t.view.physicalSize = const Size(720, 1600);
        t.view.devicePixelRatio = 2;
        addTearDown(t.view.reset);
        await t.pumpWidget(MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: buildTheme(dark ? SkTokens.dark : SkTokens.light, dark ? Brightness.dark : Brightness.light),
          home: Scaffold(body: SafeArea(child: e.value())),
        ));
        await t.pumpAndSettle();
        await expectLater(find.byType(MaterialApp), matchesGoldenFile('screens/$name.png'));
      });
    }
  }
}
