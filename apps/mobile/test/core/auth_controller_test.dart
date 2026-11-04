import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/auth/auth_controller.dart';
import 'package:salonkit/core/auth/device_info.dart';
import 'package:salonkit/core/auth/secure_store.dart';
import 'package:salonkit/core/auth/session_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../support/fake_adapter.dart';

Map<String, dynamic> fx(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync()) as Map<String, dynamic>;
const salon = SavedSalon(slug: 'supersalon', name: 'Super Salon', logoUrl: null);
const dev = DeviceInfo(name: 'iPhone', platform: 'ios', appVersion: '1.0.0');

({AuthController c, FakeAdapter a, MemorySecureStore s}) make(Map<String, Handler> routes, {MemorySecureStore? secure}) {
  final a = FakeAdapter(routes);
  final s = secure ?? MemorySecureStore();
  final c = AuthController(
    store: SessionStore(s),
    device: dev,
    clientFor: (base, {token, onUnauthorized, onFeatureDisabled}) =>
        ApiClient(base, token: token, onUnauthorized: onUnauthorized, onFeatureDisabled: onFeatureDisabled, adapter: a),
  );
  return (c: c, a: a, s: s);
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  tearDown(Get.reset);

  test('boot with nothing → needSalon', () async {
    final t = make({});
    await t.c.boot();
    expect(t.c.state.value, AuthState.needSalon);
  });

  test('boot with salon only → needLogin', () async {
    final t = make({});
    await t.c.chooseSalon(salon);
    final t2 = make({}, secure: t.s);
    await t2.c.boot();
    expect(t2.c.state.value, AuthState.needLogin);
    expect(t2.c.salon.value!.slug, 'supersalon');
  });

  test('checkSalon normalizes and reads the brand', () async {
    final t = make({'GET /api/public/brand': (o) => {'name': 'Super Salon', 'logo_url': null}});
    final b = await t.c.checkSalon(' SuperSalon ');
    expect(b.found, isTrue);
    expect(t.a.calls.single.uri.host, 'supersalon.salonkit.online');
  });

  test('signIn saves token and me → signedIn; boot restores it', () async {
    final t = make({
      'POST /api/mobile/session': (o) => {'token': 'skm_tok', 'expires_at': 1},
      'GET /api/me': (o) => fx('me_barber.json'),
    });
    await t.c.chooseSalon(salon);
    await t.c.signIn('ali', 'pass1234');
    expect(t.c.state.value, AuthState.signedIn);
    expect(t.c.me.value!.user.username, 'ali');
    final body = t.a.calls.first.data as Map;
    expect(body['username'], 'ali');
    expect((body['device'] as Map)['platform'], 'ios');
    expect(((body['device'] as Map)['id'] as String).length, greaterThanOrEqualTo(8));
    expect(t.a.calls.last.headers['Authorization'], 'Bearer skm_tok');

    final t2 = make({'GET /api/me': (o) => fx('me_barber.json')}, secure: t.s);
    await t2.c.boot();
    expect(t2.c.state.value, AuthState.signedIn);
  });

  test('wrong password surfaces server text, no token saved', () async {
    final t = make({'POST /api/mobile/session': (o) => const FakeReply(401, {'error': 'Wrong salon ID, username or password'})});
    await t.c.chooseSalon(salon);
    await expectLater(t.c.signIn('ali', 'nope'), throwsA(predicate((e) => e.toString() == 'Wrong salon ID, username or password')));
    expect(await SessionStore(t.s).token(), isNull);
    expect(t.c.state.value, AuthState.needLogin);
  });

  test('401 clears token keeps salon', () async {
    var n = 0;
    final t = make({
      'POST /api/mobile/session': (o) => {'token': 'skm_tok', 'expires_at': 1},
      'GET /api/me': (o) => n++ == 0 ? fx('me_barber.json') : const FakeReply(401, {'error': 'Please sign in'}),
    });
    await t.c.chooseSalon(salon);
    await t.c.signIn('ali', 'pass1234');
    await expectLater(t.c.refreshMe(), throwsA(anything));
    expect(t.c.state.value, AuthState.needLogin);
    expect(await SessionStore(t.s).token(), isNull);
    expect(t.c.salon.value!.slug, 'supersalon');
  });

  test('switchSalon clears both', () async {
    final t = make({
      'POST /api/mobile/session': (o) => {'token': 'skm_tok', 'expires_at': 1},
      'GET /api/me': (o) => fx('me_barber.json'),
    });
    await t.c.chooseSalon(salon);
    await t.c.signIn('ali', 'pass1234');
    await t.c.switchSalon();
    expect(t.c.state.value, AuthState.needSalon);
    expect(t.c.salon.value, isNull);
    expect(await SessionStore(t.s).salon(), isNull);
  });

  test('signOut calls both deletes even if offline', () async {
    final t = make({
      'POST /api/mobile/session': (o) => {'token': 'skm_tok', 'expires_at': 1},
      'GET /api/me': (o) => fx('me_barber.json'),
      'DELETE /api/push/tokens': (o) => throw offline(o),
      'DELETE /api/mobile/session': (o) => throw offline(o),
    });
    await t.c.chooseSalon(salon);
    await t.c.signIn('ali', 'pass1234');
    await t.c.signOut(pushToken: 'fcm-1');
    final paths = t.a.calls.map((o) => '${o.method} ${o.uri.path}').toList();
    expect(paths, containsAll(['DELETE /api/push/tokens', 'DELETE /api/mobile/session']));
    expect(t.c.state.value, AuthState.needLogin);
    expect(await SessionStore(t.s).token(), isNull);
  });

  test('403 feature_disabled re-reads the switches', () async {
    var meCalls = 0;
    final t = make({
      'POST /api/mobile/session': (o) => {'token': 'skm_tok', 'expires_at': 1},
      'GET /api/me': (o) {
        meCalls++;
        return fx(meCalls == 1 ? 'me_owner.json' : 'me_barber.json');
      },
      'GET /api/ledger': (o) => const FakeReply(403, {'error': 'x', 'code': 'feature_disabled'}),
    });
    await t.c.chooseSalon(salon);
    await t.c.signIn('owner', 'pass1234');
    await expectLater(t.c.api.get('/api/ledger', (j) => j), throwsA(anything));
    await pumpEventQueue();
    expect(meCalls, 2);
    expect(t.c.me.value!.user.username, 'ali');
  });
}
