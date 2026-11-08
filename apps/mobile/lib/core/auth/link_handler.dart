import 'dart:async';

import 'package:app_links/app_links.dart';

import '../api/api_error.dart';
import '../config.dart';
import 'auth_controller.dart';

/// One-tap sign-in and invite links (`https://<salon>.salonkit.online/l/?e=<email>&c=<code>`) open the app directly
/// (Android App Links / iOS Universal Links) and sign in with the code. A failure shows on the first screen.
class LinkHandler {
  LinkHandler(this.auth, {Stream<Uri>? links}) : _links = links;
  final AuthController auth;
  final Stream<Uri>? _links;
  StreamSubscription<Uri>? _sub;
  String? _last;

  /// Listens for links, including the one that launched the app. Call once the session has been read (boot).
  void start() => _sub ??= (_links ?? AppLinks().uriLinkStream).listen((u) => handle(u));

  Future<void> dispose() async => _sub?.cancel();

  /// True when [u] was a sign-in link (handled, even if it failed).
  Future<bool> handle(Uri u) async {
    final path = u.path.endsWith('/') ? u.path : '${u.path}/';
    final email = u.queryParameters['e'], code = u.queryParameters['c'];
    if (path != '/l/' || email == null || code == null) return false;
    if (_last == u.toString()) return true; // the launch link can arrive twice
    _last = u.toString();
    // Someone else (or the same person) signed in on this phone: the link's person takes over.
    if (auth.state.value == AuthState.signedIn) await auth.signOut();
    try {
      await auth.signInWithEmailCode(email, code, slug: slugOfLinkHost(u.host));
      auth.linkMessage.value = null;
    } on Offline {
      auth.linkMessage.value = "You're offline. Open the link again when you're connected.";
    } on Unauthorized {
      auth.linkMessage.value = 'That link has expired or was already used. Ask for a new code below.';
    } on ApiError catch (e) {
      auth.linkMessage.value = e.message;
    }
    return true;
  }
}
