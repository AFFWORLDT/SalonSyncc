import 'dart:io' show Platform;

import 'package:firebase_auth/firebase_auth.dart';

/// "Continue with Google / Apple": Firebase Auth runs the provider's sign-in sheet and hands back an ID token, which
/// SalonKit's server checks (POST /api/auth/social). The app then signs out of Firebase at once: SalonKit keeps its
/// own session. Null = the person closed the sheet.
abstract class SocialAuth {
  Future<String?> google();
  Future<String?> apple();

  /// Sign in with Apple is offered on iPhone and iPad (Apple's rule once Google is there).
  bool get appleAvailable;
}

/// A sign-in sheet that failed for a reason worth showing (no network, provider off).
class SocialAuthError implements Exception {
  const SocialAuthError(this.message);
  final String message;
  @override
  String toString() => message;
}

class FirebaseSocialAuth implements SocialAuth {
  const FirebaseSocialAuth();

  static const _cancelled = {'canceled', 'cancelled', 'web-context-canceled', 'web-context-cancelled', 'user-cancelled', 'popup-closed-by-user', 'sign_in_canceled'};

  Future<String?> _with(AuthProvider p) async {
    final fa = FirebaseAuth.instance;
    try {
      final cred = await fa.signInWithProvider(p);
      return await cred.user?.getIdToken(true);
    } on FirebaseAuthException catch (e) {
      if (_cancelled.contains(e.code)) return null;
      throw SocialAuthError(switch (e.code) {
        'network-request-failed' => "You're offline",
        'operation-not-allowed' => 'This sign-in is not switched on yet. Use your email instead.',
        _ => e.message ?? "That sign-in didn't work. Use your email instead.",
      });
    } finally {
      await fa.signOut().catchError((_) {});
    }
  }

  @override
  Future<String?> google() => _with(GoogleAuthProvider()..addScope('email'));

  @override
  Future<String?> apple() => _with(AppleAuthProvider()
    ..addScope('email')
    ..addScope('name'));

  @override
  bool get appleAvailable => Platform.isIOS;
}
