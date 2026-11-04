import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/models/app_config.dart';
import 'package:salonkit/models/brand.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/models/role.dart';

Map<String, dynamic> fx(String name) => jsonDecode(File('test/fixtures/$name').readAsStringSync()) as Map<String, dynamic>;

void main() {
  test('owner parses as admin with the salon\'s features', () {
    final me = Me.fromJson(fx('me_owner.json'));
    expect(me.role, Role.admin);
    expect(me.user.username, 'owner');
    expect(me.org.slug, 'supersalon');
    expect(me.features, contains('customers_crm'));
    expect(me.features, isNot(contains('ledger')));
    expect(me.today, '2026-11-04');
    expect(me.salonName, 'supersalon');
  });

  test('barber parses', () {
    final me = Me.fromJson(fx('me_barber.json'));
    expect(me.role, Role.barber);
    expect(me.canAddExpense, isFalse);
    expect(me.user.commissionPct, isNull);
  });

  test('roleOf maps owner and admin to admin', () {
    expect(roleOf('owner'), Role.admin);
    expect(roleOf('admin'), Role.admin);
    expect(roleOf('barber'), Role.barber);
  });

  test('brand found and missing', () {
    expect(Brand.fromJson(fx('brand.json')).found, isTrue);
    expect(Brand.fromJson(fx('brand_missing.json')).found, isFalse);
    expect(Brand.fromJson({'name': 'X', 'logo_url': '/api/public/logo/3?org=x'}).logoUrl, '/api/public/logo/3?org=x');
  });

  test('app config parses', () {
    final c = AppConfig.fromJson(fx('app_config.json'));
    expect(c.minVersion, '1.0.0');
    expect(c.storeUrl, startsWith('https://'));
  });

  test('missing user throws FormatException', () {
    final j = fx('me_owner.json')..remove('user');
    expect(() => Me.fromJson(j), throwsFormatException);
  });
}
