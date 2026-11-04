import 'package:get/get.dart';

import '../../models/brand.dart';
import '../../models/me.dart';
import '../api/api_client.dart';
import '../api/api_error.dart';
import '../config.dart';
import 'device_info.dart';
import 'session_store.dart';

export 'session_store.dart' show SavedSalon;

enum AuthState { unknown, needSalon, needLogin, signedIn }

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
  String? _token;
  ApiClient? _api;

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

  Future<void> signIn(String username, String password) async {
    final s = salon.value!;
    final c = clientFor(salonBase(s.slug));
    final r = await c.post('/api/mobile/session', {
      if (isDevHost) 'org': s.slug,
      'username': username.trim(),
      'password': password,
      'device': {'id': await store.deviceId(), 'name': device.name, 'platform': device.platform, 'app_version': device.appVersion},
    }, (j) => j as Map<String, dynamic>);
    final token = r['token'];
    if (token is! String) throw const ServerError();
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
    if (_token != null && salon.value != null) {
      if (pushToken != null) {
        await api.delete('/api/push/tokens', (_) => null, body: {'token': pushToken}).then((_) {}, onError: (_) {});
      }
      await api.delete('/api/mobile/session', (_) => null).then((_) {}, onError: (_) {});
    }
    await _forget();
  }

  Future<void> switchSalon({String? pushToken}) async {
    await signOut(pushToken: pushToken);
    await store.clearSalon();
    salon.value = null;
    state.value = AuthState.needSalon;
  }

  void onUnauthorized() => _forget();

  Future<void> _forget() async {
    _token = null;
    _api = null;
    me.value = null;
    state.value = salon.value == null ? AuthState.needSalon : AuthState.needLogin;
    await store.clearToken();
  }
}
