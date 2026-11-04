import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'biometric_service.dart';

const kRelockAfter = Duration(minutes: 5);
const kUnlockReason = "Unlock to see your salon's data";

/// The optional fingerprint / Face ID lock: on cold start and after 5 minutes in the background, when turned on.
class LockController extends GetxController {
  LockController(this.biometrics);
  final Biometrics biometrics;

  static const _on = 'sk.biometric';
  static const _asked = 'sk.biometric.asked';

  final enabled = false.obs;
  final locked = false.obs;
  final available = false.obs;
  DateTime? _pausedAt;

  Future<void> load() async {
    enabled.value = (await SharedPreferences.getInstance()).getBool(_on) ?? false;
    available.value = await biometrics.available();
    locked.value = enabled.value;
  }

  /// Turning it on needs a successful scan, so nobody locks themselves out.
  Future<bool> enable() async {
    if (!await biometrics.authenticate('Confirm to turn on the lock')) return false;
    enabled.value = true;
    await (await SharedPreferences.getInstance()).setBool(_on, true);
    return true;
  }

  Future<void> disable() async {
    enabled.value = false;
    locked.value = false;
    await (await SharedPreferences.getInstance()).setBool(_on, false);
  }

  Future<bool> unlock() async {
    if (!locked.value) return true;
    final ok = await biometrics.authenticate(kUnlockReason);
    if (ok) locked.value = false;
    return ok;
  }

  /// Signing out ends the lock too (the sign-in screen needs no unlock).
  void clear() => locked.value = false;

  void onPaused(DateTime now) => _pausedAt = now;

  void onResumed(DateTime now) {
    final at = _pausedAt;
    _pausedAt = null;
    if (enabled.value && at != null && now.difference(at) >= kRelockAfter) locked.value = true;
  }

  Future<bool> shouldOffer() async =>
      !enabled.value && await biometrics.available() && !((await SharedPreferences.getInstance()).getBool(_asked) ?? false);

  Future<void> markAsked() async => (await SharedPreferences.getInstance()).setBool(_asked, true);
}
