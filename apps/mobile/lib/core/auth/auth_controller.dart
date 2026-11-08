import 'package:get/get.dart';

import '../screen_cache.dart';
import '../../models/brand.dart';
import '../../models/me.dart';
import '../api/api_client.dart';
import '../api/api_error.dart';
import '../config.dart';
import 'device_info.dart';
import 'session_store.dart';

export 'session_store.dart' show SavedSalon;

enum AuthState { unknown, needSalon, needLogin, signedIn }

/// Google / Apple said who this is, and no salon has that email yet: offer a new salon.
class SocialNew {
  const SocialNew({required this.idToken, required this.email, this.name});
  final String idToken, email;
  final String? name;
}

typedef ClientFactory = ApiClient Function(Uri base, {String? Function()? token, void Function()? onUnauthorized, void Function()? onFeatureDisabled});

/// Who is signed in, to which salon. Remembers both; a 401 anywhere returns to sign-in with the salon kept.
class AuthController extends GetxController {
  AuthController({required this.store, required this.device, required this.clientFor});

  final SessionStore store;
  final DeviceInfo device;
  final ClientFactory clientFor;

  final state = AuthState.unknown.obs;
  final me = Rxn<Me>();
  final salon = Rxn<SavedSalon>();

  /// A salon was just created on this phone: the first-run setup (logo, invite the team) opens once.
  bool justSignedUp = false;

  /// Why a tapped sign-in link didn't work (expired, used), shown on the first screen.
  final linkMessage = RxnString();
  String? _token;
  ApiClient? _api;

  /// Set by the push service: this phone's push token (dropped on the server at sign-out) and its own clean-up.
  String? Function()? pushToken;
  Future<void> Function()? afterSignOut;

  /// The signed-in salon's API (token attached). Only valid once a salon is chosen.
  ApiClient get api => _api ??= clientFor(salonBase(salon.value!.slug),
      token: () => _token, onUnauthorized: onUnauthorized, onFeatureDisabled: () => refreshMe().then((_) {}, onError: (_) {}));

  /// Public calls before sign-in; on a dev host the salon is named with ?org=.
  Map<String, Object?>? _orgQuery(String slug) => isDevHost ? {'org': slug} : null;

  /// Reads the remembered salon and token. [hold] (the splash's minimum time) delays only the final state change.
  Future<void> boot({Future<void>? hold}) async {
    salon.value = await store.salon();
    _token = await store.token();
    _api = null;
    var next = AuthState.signedIn;
    if (salon.value == null) {
      next = AuthState.needSalon;
    } else if (_token == null) {
      next = AuthState.needLogin;
    } else {
      try {
        await refreshMe();
      } on Unauthorized {
        next = salon.value == null ? AuthState.needSalon : AuthState.needLogin;
      } on ApiError {
        // Offline or server trouble at launch: stay signed in; screens show the offline state and retry.
      }
    }
    if (hold != null) await hold;
    state.value = next;
  }

  Future<Brand> checkSalon(String typed) async {
    final slug = normalizeSlug(typed);
    if (!isValidSlug(slug)) return const Brand();
    final c = clientFor(salonBase(slug));
    return c.get('/api/public/brand', (j) => Brand.fromJson(j as Map<String, dynamic>), query: _orgQuery(slug));
  }

  Future<void> chooseSalon(SavedSalon s) async {
    await store.saveSalon(s);
    salon.value = s;
    _api = null;
    state.value = AuthState.needLogin;
  }

  Future<void> signIn(String username, String password) => _session({'username': username.trim(), 'password': password});

  /// Emails a 6-digit sign-in code to the staff member with [email] (the server answers the same for any email).
  Future<void> requestCode(String email) async {
    final s = salon.value!;
    await clientFor(salonBase(s.slug)).post('/api/auth/code', {if (isDevHost) 'org': s.slug, 'email': email.trim()}, (_) {});
  }

  /// "Forgot password?": the code from [requestCode] and a new password, then signed in with it (other sessions end).
  Future<void> resetPassword(String email, String code, String password) async {
    final s = salon.value!;
    final r = await clientFor(salonBase(s.slug)).post('/api/auth/password/reset', {
      if (isDevHost) 'org': s.slug,
      'email': email.trim(),
      'code': code.replaceAll(RegExp(r'\s'), ''),
      'password': password,
    }, (j) => j as Map<String, dynamic>);
    await signIn(r['username'] as String? ?? email, password);
  }

  /// Signs in with the code from [requestCode] instead of a password.
  Future<void> signInWithCode(String email, String code) => _session({'email': email.trim(), 'code': code.replaceAll(RegExp(r'\s'), '')});

  Future<void> _session(Map<String, Object?> credentials) async {
    final s = salon.value!;
    final c = clientFor(salonBase(s.slug));
    final r = await c.post('/api/mobile/session', {
      if (isDevHost) 'org': s.slug,
      ...credentials,
      'device': await _deviceBody(),
    }, (j) => j as Map<String, dynamic>);
    final token = r['token'];
    if (token is! String) throw const ServerError();
    await store.saveToken(token);
    _token = token;
    _api = null;
    await refreshMe();
    state.value = AuthState.signedIn;
  }

  Future<Map<String, Object?>> _deviceBody() async => {'id': await store.deviceId(), 'name': device.name, 'platform': device.platform, 'app_version': device.appVersion};

  /// "Just your email": emails a 6-digit code and a one-tap link. The server finds the salon from the email (one email
  /// = one salon) and answers the same whether or not it knows the email.
  Future<void> requestEmailCode(String email) => clientFor(rootBase()).post('/api/auth/code', {'email': email.trim()}, (_) {});

  /// Signs in with an emailed code, or a tapped link ([slug] from its host). The salon comes back from the server.
  Future<void> signInWithEmailCode(String email, String code, {String? slug}) async {
    final c = clientFor(slug == null ? rootBase() : salonBase(slug));
    final r = await c.post('/api/mobile/session', {
      if (isDevHost && slug != null) 'org': slug,
      'email': email.trim(),
      'code': code.replaceAll(RegExp(r'\s'), ''),
      'device': await _deviceBody(),
    }, (j) => j as Map<String, dynamic>);
    await _adopt(r);
  }

  /// "Continue with Google / Apple" with the provider's [idToken]: signed in when the email is on a team; otherwise
  /// the email (and name) to start a new salon with ([signUp] with the same token).
  Future<SocialNew?> socialSignIn(String idToken) async {
    final r = await clientFor(rootBase()).post('/api/auth/social', {'id_token': idToken, 'device': await _deviceBody()}, (j) => j as Map<String, dynamic>);
    if (r['new'] == true) return SocialNew(idToken: idToken, email: r['email'] as String? ?? '', name: r['name'] as String?);
    await _adopt(r);
    return null;
  }

  /// A new salon on the 7-day free trial, signed in straight away as its owner. With [idToken] (Google / Apple) the
  /// email and password are not sent: the verified email is the owner's, and they sign in with Google / Apple or a code.
  Future<void> signUp({required String salonName, required String ownerName, String email = '', required String slug, String password = '', String? phone, required String country, String? idToken}) async {
    final r = await clientFor(rootBase()).post('/api/public/signup', {
      'salon_name': salonName.trim(),
      'owner_name': ownerName.trim(),
      if (idToken != null) 'id_token': idToken else ...{'email': email.trim(), 'password': password},
      'slug': normalizeSlug(slug),
      if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
      'country': country,
      'device': await _deviceBody(),
    }, (j) => j as Map<String, dynamic>);
    justSignedUp = true;
    await _adopt(r);
  }

  /// Is this salon ID free for a new salon? ('invalid' / 'taken' / 'reserved' when not.)
  Future<String?> slugProblem(String slug) async {
    final r = await clientFor(rootBase()).get('/api/public/slug', (j) => j as Map<String, dynamic>, query: {'s': normalizeSlug(slug)});
    return r['available'] == true ? null : (r['reason'] as String? ?? 'taken');
  }

  /// Takes a phone session the server returned with its salon ({token, slug}): remembers the salon (with its name and
  /// logo) and the token, then loads me.
  Future<void> _adopt(Map<String, dynamic> r) async {
    final token = r['token'], slug = r['slug'];
    if (token is! String || slug is! String) throw const ServerError();
    final b = await checkSalon(slug).catchError((Object _) => const Brand());
    final s = SavedSalon(slug: slug, name: b.name ?? slug, logoUrl: b.logoUrl);
    await store.saveSalon(s);
    salon.value = s;
    await store.saveToken(token);
    _token = token;
    _api = null;
    await refreshMe();
    state.value = AuthState.signedIn;
  }

  Future<Me> refreshMe() async {
    final m = await api.get('/api/me', (j) => Me.fromJson(j as Map<String, dynamic>));
    me.value = m;
    return m;
  }

  /// Best effort on the server (offline is fine), then forget the token. The salon stays.
  Future<void> signOut({String? pushToken}) async {
    final push = pushToken ?? this.pushToken?.call();
    if (_token != null && salon.value != null) {
      if (push != null) {
        await api.delete('/api/push/tokens', (_) => null, body: {'token': push}).then((_) {}, onError: (_) {});
      }
      await api.delete('/api/mobile/session', (_) => null).then((_) {}, onError: (_) {});
    }
    await _forget();
    await afterSignOut?.call();
  }

  Future<void> switchSalon({String? pushToken}) async {
    await signOut(pushToken: pushToken);
    await store.clearSalon();
    salon.value = null;
    state.value = AuthState.needSalon;
  }

  /// The server ended this session (expired, password changed, signed out by an admin): back to sign-in, and the
  /// same clean-up as signing out (push resets so the next person on this phone registers their own token).
  void onUnauthorized() => _forget().then((_) => afterSignOut?.call());

  Future<void> _forget() async {
    ScreenCache.clear(); // the next person must not see this one's numbers
    _token = null;
    _api = null;
    me.value = null;
    state.value = salon.value == null ? AuthState.needSalon : AuthState.needLogin;
    await store.clearToken();
  }
}
