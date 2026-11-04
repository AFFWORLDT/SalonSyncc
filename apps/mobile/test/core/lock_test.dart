import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:salonkit/core/auth/biometric_service.dart';
import 'package:salonkit/core/auth/lock_controller.dart';
import 'package:salonkit/modules/account/account_module.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../support/fake_adapter.dart';
import '../support/harness.dart';
import '../support/me_fixture.dart';

class FakeBiometrics implements Biometrics {
  FakeBiometrics({this.has = true, this.pass = true});
  bool has, pass;
  int asks = 0;
  @override
  Future<bool> available() async => has;
  @override
  Future<bool> authenticate(String reason) async {
    asks++;
    return pass;
  }
}

final t0 = DateTime(2026, 11, 4, 10);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  tearDown(Get.reset);

  test('enable needs a successful scan', () async {
    final b = FakeBiometrics(pass: false);
    final l = LockController(b);
    await l.load();
    expect(await l.enable(), isFalse);
    expect(l.enabled.value, isFalse);
    b.pass = true;
    expect(await l.enable(), isTrue);
    expect((await SharedPreferences.getInstance()).getBool('sk.biometric'), isTrue);
  });

  test('cold start locked when on', () async {
    SharedPreferences.setMockInitialValues({'sk.biometric': true});
    final l = LockController(FakeBiometrics());
    await l.load();
    expect(l.locked.value, isTrue);
    SharedPreferences.setMockInitialValues({});
    final off = LockController(FakeBiometrics());
    await off.load();
    expect(off.locked.value, isFalse);
  });

  test('resume after 4 min not locked, after 5 min locked', () async {
    SharedPreferences.setMockInitialValues({'sk.biometric': true});
    final l = LockController(FakeBiometrics());
    await l.load();
    await l.unlock();
    l.onPaused(t0);
    l.onResumed(t0.add(const Duration(minutes: 4)));
    expect(l.locked.value, isFalse);
    l.onPaused(t0);
    l.onResumed(t0.add(const Duration(minutes: 5)));
    expect(l.locked.value, isTrue);
  });

  test('failed scan stays locked', () async {
    SharedPreferences.setMockInitialValues({'sk.biometric': true});
    final l = LockController(FakeBiometrics(pass: false));
    await l.load();
    expect(await l.unlock(), isFalse);
    expect(l.locked.value, isTrue);
  });

  test('offer once, only when available', () async {
    final l = LockController(FakeBiometrics());
    await l.load();
    expect(await l.shouldOffer(), isTrue);
    await l.markAsked();
    expect(await l.shouldOffer(), isFalse);
    final none = LockController(FakeBiometrics(has: false));
    await none.load();
    expect(await none.shouldOffer(), isFalse);
  });

  testWidgets('toggle hidden when unavailable, shown when available', (t) async {
    for (final has in [false, true]) {
      await t.pumpWidget(const SizedBox()); // drop the previous round's tree (it watches the old controller)
      Get.reset();
      putAuth(FakeAdapter({})).me.value = meWith();
      final l = Get.put(LockController(FakeBiometrics(has: has)));
      await l.load();
      registerLockToggle();
      await t.pumpWidget(const MaterialApp(home: Scaffold(body: AccountScreen())));
      await t.pumpAndSettle();
      expect(find.text('Unlock with Face ID / fingerprint'), has ? findsOneWidget : findsNothing);
    }
  });
}
