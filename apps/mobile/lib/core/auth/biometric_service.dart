import 'package:local_auth/local_auth.dart';

/// Fingerprint / Face ID, behind an interface so tests don't need a phone.
abstract class Biometrics {
  Future<bool> available();
  Future<bool> authenticate(String reason);
}

class LocalAuthBiometrics implements Biometrics {
  final _auth = LocalAuthentication();

  @override
  Future<bool> available() async {
    try {
      return await _auth.canCheckBiometrics && (await _auth.getAvailableBiometrics()).isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  /// The phone's passcode is allowed as a fallback (biometricOnly: false).
  @override
  Future<bool> authenticate(String reason) async {
    try {
      return await _auth.authenticate(localizedReason: reason, persistAcrossBackgrounding: true);
    } catch (_) {
      return false;
    }
  }
}
