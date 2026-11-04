import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/features/registry.dart';
import 'package:salonkit/modules/modules.dart';

import 'support/me_fixture.dart';

void main() {
  final r = FeatureRegistry(appModules);

  test('admins get Today as a tab next to the dashboard, and My history under More', () {
    final admin = meWith(features: ['core_sales', 'expenses', 'daily_sheet', 'reports_advanced']);
    expect(r.tabsFor(admin).map((m) => m.id), ['dashboard', 'home', 'sales', 'sheet']);
    expect(r.moreFor(admin).map((m) => m.id), contains('history'));
  });

  test('barbers keep Today, My bills and My history as tabs', () {
    final barber = meWith(barber: true, features: ['core_sales', 'expenses']);
    expect(r.tabsFor(barber).map((m) => m.id), ['home', 'bills', 'history']);
  });
}
