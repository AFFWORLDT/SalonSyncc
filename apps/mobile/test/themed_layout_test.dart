// Screens rendered with the real app theme: a theme-wide button size must not break buttons placed in a row.
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

import 'support/fake_adapter.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
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
  };
  for (final e in screens.entries) {
    for (final width in [360.0, 800.0]) {
      testWidgets('${e.key} lays out with the app theme at ${width.round()} dp', (t) async {
        t.view.physicalSize = Size(width, 2400);
        t.view.devicePixelRatio = 1;
        addTearDown(t.view.reset);
        await t.pumpWidget(MaterialApp(theme: buildTheme(SkTokens.light, Brightness.light), home: Scaffold(body: e.value)));
        await t.pumpAndSettle();
        expect(t.takeException(), isNull);
      });
    }
  }
}
