import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/features/feature_module.dart';
import 'package:salonkit/core/features/registry.dart';
import 'package:salonkit/models/role.dart';

import '../support/me_fixture.dart';

FeatureModule m(String id, {String? key, Set<Role> roles = const {Role.admin, Role.barber}, bool tab = true, int order = 0, bool Function(dynamic)? when}) =>
    FeatureModule(id: id, featureKey: key, roles: roles, title: id, icon: Icons.circle, tab: tab, order: order, visibleWhen: when == null ? null : (me) => when(me), builder: (_) => Text(id));

void main() {
  test('hides module whose key is off', () {
    final r = FeatureRegistry([m('home', order: 0), m('ledger', key: 'ledger', order: 1)]);
    expect(r.visibleFor(meWith(features: ['core_sales'])).map((x) => x.id), ['home']);
    expect(r.visibleFor(meWith(features: ['core_sales', 'ledger'])).map((x) => x.id), ['home', 'ledger']);
  });

  test('hides admin-only module from barber', () {
    final r = FeatureRegistry([m('home'), m('staff', roles: {Role.admin}, order: 1)]);
    expect(r.visibleFor(meWith(barber: true)).map((x) => x.id), ['home']);
    expect(r.visibleFor(meWith()).map((x) => x.id), ['home', 'staff']);
  });

  test('visibleWhen applies', () {
    final r = FeatureRegistry([m('expenses', when: (me) => me.canAddExpense)]);
    expect(r.visibleFor(meWith(barber: true)), isEmpty);
    expect(r.visibleFor(meWith(barber: true, canAddExpense: true)), hasLength(1));
  });

  test('more than 4 tabs overflow to More', () {
    final r = FeatureRegistry([for (var i = 0; i < 6; i++) m('t$i', order: i), m('x', tab: false, order: 9)]);
    final me = meWith();
    expect(r.tabsFor(me).map((x) => x.id), ['t0', 't1', 't2', 't3']);
    expect(r.moreFor(me).map((x) => x.id), ['t4', 't5', 'x']);
    expect(r.byId('x')!.title, 'x');
  });
}
