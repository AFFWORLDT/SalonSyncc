// Screens rendered with the real app theme (Stage E): every screen at 360 and 800 dp, at normal and large (130 %)
// text, in light and dark, and once with worst-case data (every name ~40 characters) — nothing may overflow.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/format/fmt.dart';
import 'package:salonkit/core/theme/app_theme.dart';
import 'package:salonkit/core/theme/tokens.dart';
import 'package:salonkit/data/announcements_api.dart';
import 'package:salonkit/data/audit_api.dart';
import 'package:salonkit/data/billing_api.dart';
import 'package:salonkit/data/customers_api.dart';
import 'package:salonkit/data/expenses_api.dart';
import 'package:salonkit/data/ledger_api.dart';
import 'package:salonkit/data/monthly_api.dart';
import 'package:salonkit/data/ratings_api.dart';
import 'package:salonkit/data/sales_api.dart';
import 'package:salonkit/data/services_admin_api.dart';
import 'package:salonkit/data/settings_api.dart';
import 'package:salonkit/data/staff_api.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/modules/announcements/send_screen.dart';
import 'package:salonkit/modules/audit/audit_screen.dart';
import 'package:salonkit/modules/customers/customers_screen.dart';
import 'package:salonkit/modules/expenses/expenses_screen.dart';
import 'package:salonkit/modules/ledger/ledger_screen.dart';
import 'package:salonkit/modules/monthly/monthly_screen.dart';
import 'package:salonkit/modules/plan/plan_screen.dart';
import 'package:salonkit/modules/ratings/ratings_screen.dart';
import 'package:salonkit/modules/sales/sales_screen.dart';
import 'package:salonkit/modules/services/services_screen.dart';
import 'package:salonkit/modules/settings/settings_screen.dart';
import 'package:salonkit/modules/staff/staff_screen.dart';

import 'package:salonkit/data/admin_reports_api.dart';
import 'package:salonkit/data/report_api.dart';
import 'package:salonkit/modules/bills/bills_screen.dart';
import 'package:salonkit/modules/dashboard/dashboard_screen.dart';
import 'package:salonkit/modules/sheet/sheet_screen.dart';
import 'package:salonkit/modules/today/today_screen.dart';

import 'support/fake_adapter.dart';

/// Worst case: every name-like text gets very long (an Arabic-style 40-character name).
bool longNames = false;
const _longKeys = {'name', 'customer_label', 'barber_name', 'note', 'memo', 'display_name', 'target_name', 'category', 'title', 'sender_name', 'actor_name'};
Object? _longify(Object? v) => switch (v) {
      Map m => {for (final e in m.entries) e.key: _longKeys.contains(e.key) && e.value is String ? '${e.value} Abdulrahman Al-Mansouri Khalifa Bin Zayed' : _longify(e.value)},
      List l => [for (final x in l) _longify(x)],
      _ => v,
    };
Object? raw(String n) {
  final j = jsonDecode(File('test/fixtures/$n').readAsStringSync());
  return longNames ? _longify(j) : j;
}
final owner = Me.fromJson(raw('me_owner_max.json') as Map<String, dynamic>);

void main() {
  final a = FakeAdapter({
    'GET /api/sales': (o) => raw('sales_admin_page.json'),
    'GET /api/users': (o) => raw('users.json'),
    'GET /api/expenses': (o) => raw('expenses.json'),
    'GET /api/reports/monthly': (o) => raw('monthly.json'),
    'GET /api/ledger/balances': (o) => raw('balances.json'),
    'GET /api/ledger/shop': (o) => raw('ledger_shop.json'),
    'GET /api/services': (o) => raw('services_all.json'),
    'GET /api/customers': (o) => raw('customers_admin.json'),
    'GET /api/announcements': (o) => raw('announcements.json'),
    'GET /api/ratings': (o) => raw('ratings.json'),
    'GET /api/audit': (o) => raw('audit.json'),
    'GET /api/settings': (o) => raw('settings.json'),
    'GET /api/whatsapp/config': (o) => null,
    'GET /api/billing': (o) => raw('billing.json'),
    'GET /api/reports/overview': (o) => raw('overview.json'),
    'GET /api/settings/setup': (o) => raw('setup.json'),
    'GET /api/reports/daily': (o) => raw('daily.json'),
    'GET /api/reports/me': (o) => raw('report_me.json'),
  });
  final c = ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a);
  final screens = <String, Widget>{
    'monthly': MonthlyScreen(me: owner, api: MonthlyApi(c), onMonth: (_) {}),
    'ledger': LedgerScreen(me: owner, api: LedgerApi(c)),
    'sales': SalesScreen(me: owner, sales: SalesApi(c, owner.fmt), staff: StaffApi(c), onOpen: (_) async {}, onNewSale: () async {}),
    'expenses': ExpensesScreen(me: owner, api: ExpensesApi(c), staff: StaffApi(c)),
    'staff': StaffScreen(me: owner, api: StaffApi(c)),
    'services': ServicesScreen(me: owner, api: ServicesAdminApi(c)),
    'customers': CustomersScreen(me: owner, api: CustomersApi(c), onOpen: (_) async {}),
    'announcements': SendAnnouncementScreen(me: owner, api: AnnouncementsApi(c), staff: StaffApi(c)),
    'ratings': RatingsScreen(me: owner, api: RatingsApi(c)),
    'audit': AuditScreen(me: owner, api: AuditApi(c), staff: StaffApi(c)),
    'settings': SettingsScreen(me: owner, api: SettingsApi(c), onSaved: () async {}),
    'plan': PlanScreen(me: owner, api: BillingApi(c), onChanged: () async {}),
    'dashboard': DashboardScreen(me: owner, reports: AdminReportsApi(c), onOpenSale: (_) async {}, onAllSales: (_) {}, onDailySheet: () {}, onNewSale: () async {}),
    'today': TodayScreen(me: owner, sales: SalesApi(c, owner.fmt), report: ReportApi(c), onNewSale: () async {}, onOpenSale: (_) async {}),
    'sheet': SheetScreen(me: owner, reports: AdminReportsApi(c), onDay: (_) {}),
    'bills': BillsScreen(me: owner, sales: SalesApi(c, owner.fmt), onOpen: (_) async {}, admin: true),
  };
  Future<void> layout(WidgetTester t, Widget screen, {required double width, double text = 1, Brightness b = Brightness.light}) async {
    t.view.physicalSize = Size(width, 2400);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      theme: buildTheme(b == Brightness.dark ? SkTokens.dark : SkTokens.light, b),
      home: MediaQuery(
        data: MediaQueryData(size: Size(width, 2400), textScaler: TextScaler.linear(text)),
        child: Scaffold(body: screen),
      ),
    ));
    await t.pumpAndSettle();
    expect(t.takeException(), isNull);
  }

  for (final e in screens.entries) {
    for (final width in [360.0, 800.0]) {
      testWidgets('${e.key} lays out with the app theme at ${width.round()} dp', (t) => layout(t, e.value, width: width));
    }
    testWidgets('${e.key} at 360 dp with large text (130 %)', (t) => layout(t, e.value, width: 360, text: 1.3));
    testWidgets('${e.key} at 360 dp in dark', (t) => layout(t, e.value, width: 360, b: Brightness.dark));
    testWidgets('${e.key} at 360 dp with very long names', (t) async {
      longNames = true;
      addTearDown(() => longNames = false);
      await layout(t, e.value, width: 360, text: 1.15);
      // The long names really reached the screen (where it shows names at all).
      if (const {'sales', 'bills', 'dashboard', 'staff', 'customers', 'expenses', 'services', 'sheet', 'monthly'}.contains(e.key)) {
        expect(find.textContaining('Abdulrahman', findRichText: true), findsWidgets);
      }
    });
  }

  // Accessibility (Stage E): buttons big enough to hit, every tappable thing named, readable contrast.
  for (final key in ['dashboard', 'today', 'sales', 'bills', 'customers', 'staff', 'services', 'settings']) {
    testWidgets('$key meets the tap-target, label and contrast guidelines', (t) async {
      final h = t.ensureSemantics();
      await layout(t, screens[key]!, width: 360);
      await expectLater(t, meetsGuideline(androidTapTargetGuideline));
      await expectLater(t, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(t, meetsGuideline(textContrastGuideline));
      h.dispose();
    });
  }
}
