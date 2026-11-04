// Screens rendered with the real app theme: a theme-wide button size must not break buttons placed in a row.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/format/fmt.dart';
import 'package:salonkit/core/theme/app_theme.dart';
import 'package:salonkit/core/theme/tokens.dart';
import 'package:salonkit/data/expenses_api.dart';
import 'package:salonkit/data/ledger_api.dart';
import 'package:salonkit/data/monthly_api.dart';
import 'package:salonkit/modules/ledger/ledger_screen.dart';
import 'package:salonkit/modules/monthly/monthly_screen.dart';
import 'package:salonkit/data/sales_api.dart';
import 'package:salonkit/data/staff_api.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/modules/expenses/expenses_screen.dart';
import 'package:salonkit/modules/sales/sales_screen.dart';
import 'package:salonkit/modules/staff/staff_screen.dart';

import 'support/fake_adapter.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
final owner = Me.fromJson(raw('me_owner_e2e.json') as Map<String, dynamic>);

void main() {
  final a = FakeAdapter({
    'GET /api/sales': (o) => raw('sales_admin_page.json'),
    'GET /api/users': (o) => raw('users.json'),
    'GET /api/expenses': (o) => raw('expenses.json'),
    'GET /api/reports/monthly': (o) => raw('monthly.json'),
    'GET /api/ledger/balances': (o) => raw('balances.json'),
    'GET /api/ledger/shop': (o) => raw('ledger_shop.json'),
  });
  final c = ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a);
  final screens = <String, Widget>{
    'monthly': MonthlyScreen(me: owner, api: MonthlyApi(c), onMonth: (_) {}),
    'ledger': LedgerScreen(me: owner, api: LedgerApi(c)),
    'sales': SalesScreen(me: owner, sales: SalesApi(c, owner.fmt), staff: StaffApi(c), onOpen: (_) async {}, onNewSale: () async {}),
    'expenses': ExpensesScreen(me: owner, api: ExpensesApi(c), staff: StaffApi(c)),
    'staff': StaffScreen(me: owner, api: StaffApi(c)),
  };
  for (final e in screens.entries) {
    testWidgets('${e.key} lays out with the app theme', (t) async {
      await t.pumpWidget(MaterialApp(theme: buildTheme(SkTokens.light, Brightness.light), home: Scaffold(body: e.value)));
      await t.pumpAndSettle();
      expect(t.takeException(), isNull);
    });
  }
}
