import 'dart:convert';
import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

import 'secure_store.dart';

/// The salon this phone uses (not secret: kept in preferences).
class SavedSalon {
  const SavedSalon({required this.slug, required this.name, this.logoUrl});
  final String slug, name;
  final String? logoUrl;

  Map<String, Object?> toJson() => {'slug': slug, 'name': name, 'logoUrl': logoUrl};
  static SavedSalon? fromJson(Object? j) {
    if (j is! Map || j['slug'] is! String || j['name'] is! String) return null;
    return SavedSalon(slug: j['slug'] as String, name: j['name'] as String, logoUrl: j['logoUrl'] as String?);
  }
}

/// The phone token (secure storage only), the chosen salon and this install's device id.
class SessionStore {
  SessionStore(this._secure);
  final SecureStore _secure;

  static const _token = 'sk.token';
  static const _device = 'sk.device';
  static const _salon = 'sk.salon';

  Future<String?> token() => _secure.read(_token);
  Future<void> saveToken(String t) => _secure.write(_token, t);
  Future<void> clearToken() => _secure.delete(_token);

  Future<SavedSalon?> salon() async {
    final raw = (await SharedPreferences.getInstance()).getString(_salon);
    if (raw == null) return null;
    try {
      return SavedSalon.fromJson(jsonDecode(raw));
    } on FormatException {
      return null;
    }
  }

  Future<void> saveSalon(SavedSalon s) async => (await SharedPreferences.getInstance()).setString(_salon, jsonEncode(s.toJson()));
  Future<void> clearSalon() async => (await SharedPreferences.getInstance()).remove(_salon);

  /// A random id made once per install; the server keys one session per (user, device) on it.
  Future<String> deviceId() async {
    final have = await _secure.read(_device);
    if (have != null) return have;
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    final r = Random.secure();
    final id = List.generate(32, (_) => chars[r.nextInt(chars.length)]).join();
    await _secure.write(_device, id);
    return id;
  }
}
