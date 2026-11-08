import 'dart:io' show Platform;

import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';

/// "Continue with Google / Apple", in the app (no browser): Google's own account sheet (google_sign_in: Credential
/// Manager on Android, Google's sheet on iOS) or Apple's native sheet. Firebase Auth turns that into an ID token, which
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

  static Future<void>? _googleReady;

  /// Google's native account sheet; its ID token goes through Firebase (same server check as Apple).
  @override
  Future<String?> google() async {
    final g = GoogleSignIn.instance;
    final fa = FirebaseAuth.instance;
    try {
      // Client IDs come from google-services.json / GoogleService-Info.plist (not in git).
      await (_googleReady ??= g.initialize());
      final account = await g.authenticate(scopeHint: const ['email']);
      final idToken = account.authentication.idToken;
      if (idToken == null) throw const SocialAuthError("Google didn't confirm your account. Use your email instead.");
      final cred = await fa.signInWithCredential(GoogleAuthProvider.credential(idToken: idToken));
      return await cred.user?.getIdToken(true);
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled || e.code == GoogleSignInExceptionCode.interrupted) return null;
      throw SocialAuthError(e.description ?? "Google sign-in didn't work. Use your email instead.");
    } on FirebaseAuthException catch (e) {
      throw SocialAuthError(e.code == 'network-request-failed' ? "You're offline" : (e.message ?? "Google sign-in didn't work. Use your email instead."));
    } finally {
      await fa.signOut().catchError((_) {});
      // Next time the sheet asks which account again (a shared salon phone).
      await g.signOut().catchError((_) {});
    }
  }

  @override
  Future<String?> apple() => _with(AppleAuthProvider()
    ..addScope('email')
    ..addScope('name'));

  @override
  bool get appleAvailable => Platform.isIOS;
}
