import 'package:flutter/services.dart' show PlatformException;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Keychain / Keystore, behind an interface so tests use memory.
abstract class SecureStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class FlutterSecureStore implements SecureStore {
  const FlutterSecureStore();
  // resetOnError: storage this install can't unlock (an old install's data restored onto a new one: the key lives
  // in the old phone's Keystore) is wiped instead of failing every read; the app then starts signed out.
  static const _s = FlutterSecureStorage(
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
    aOptions: AndroidOptions(resetOnError: true),
  );

  @override
  Future<String?> read(String key) async {
    try {
      return await _s.read(key: key);
    } on PlatformException {
      await _s.deleteAll().catchError((Object _) {});
      return null;
    }
  }
  @override
  Future<void> write(String key, String value) => _s.write(key: key, value: value);
  @override
  Future<void> delete(String key) => _s.delete(key: key);
}

class MemorySecureStore implements SecureStore {
  final _m = <String, String>{};
  @override
  Future<String?> read(String key) async => _m[key];
  @override
  Future<void> write(String key, String value) async => _m[key] = value;
  @override
  Future<void> delete(String key) async => _m.remove(key);
}
