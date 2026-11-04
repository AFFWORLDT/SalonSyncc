import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';

import '../../models/me.dart';
import '../auth/auth_controller.dart';

/// Firebase Messaging, behind an interface so tests don't need Firebase.
abstract class PushPlatform {
  Future<bool> requestPermission();
  Future<String?> token();
  Stream<String> get onTokenRefresh;
  Future<void> deleteToken();
}

class FirebasePushPlatform implements PushPlatform {
  FirebaseMessaging get _m => FirebaseMessaging.instance;

  @override
  Future<bool> requestPermission() async {
    final s = await _m.requestPermission();
    return s.authorizationStatus == AuthorizationStatus.authorized || s.authorizationStatus == AuthorizationStatus.provisional;
  }

  @override
  Future<String?> token() => _m.getToken();
  @override
  Stream<String> get onTokenRefresh => _m.onTokenRefresh;
  @override
  Future<void> deleteToken() => _m.deleteToken();
}

/// Registers this phone for the salon's pushes when the salon has the `push` feature; forgets it on sign-out.
class PushService {
  PushService({required this.platform, required this.auth});
  final PushPlatform platform;
  final AuthController auth;

  String? _sent;
  String? get currentToken => _sent;
  StreamSubscription<String>? _refresh;

  Future<void> onSignedIn(Me me) async {
    if (!me.features.contains('push')) return;
    if (_sent != null) return;
    try {
      if (!await platform.requestPermission()) return;
      final t = await platform.token();
      if (t == null) return;
      await _post(t);
      _refresh ??= platform.onTokenRefresh.listen((t) => _post(t).then((_) {}, onError: (_) {}));
    } catch (_) {
      // No Firebase config, permission refused, offline: pushes stay off; the app works without them.
    }
  }

  Future<void> _post(String t) async {
    await auth.api.post('/api/push/tokens', {'token': t}, (_) => null);
    _sent = t;
  }

  Future<void> onSignedOut() async {
    await _refresh?.cancel();
    _refresh = null;
    _sent = null;
    try {
      await platform.deleteToken();
    } catch (_) {}
  }
}
