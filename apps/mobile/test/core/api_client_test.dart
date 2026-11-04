import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/api/api_error.dart';

import '../support/fake_adapter.dart';

ApiClient client(FakeAdapter a, {String? token, void Function()? onUnauthorized}) =>
    ApiClient(Uri.parse('https://s.salonkit.online'), token: () => token, onUnauthorized: onUnauthorized, adapter: a);

void main() {
  test('connection error maps to offline', () async {
    final a = FakeAdapter({'GET /api/me': (o) => throw offline(o)});
    final before = networkTrouble.value;
    await expectLater(client(a).get('/api/me', (j) => j), throwsA(isA<Offline>()));
    expect(networkTrouble.value, before + 1);
  });

  test('a connection dropped mid-request maps to offline', () async {
    for (final cause in [const SocketException('Connection reset by peer'), const HttpException('Connection closed while receiving data')]) {
      final a = FakeAdapter({'GET /api/me': (o) => throw DioException(requestOptions: o, error: cause)});
      final before = networkTrouble.value;
      await expectLater(client(a).get('/api/me', (j) => j), throwsA(isA<Offline>()));
      expect(networkTrouble.value, before + 1);
    }
  });

  test('401 calls onUnauthorized and throws Unauthorized', () async {
    var n = 0;
    final a = FakeAdapter({'GET /api/me': (o) => const FakeReply(401, {'error': 'Please sign in'})});
    await expectLater(client(a, onUnauthorized: () => n++).get('/api/me', (j) => j), throwsA(isA<Unauthorized>()));
    expect(n, 1);
  });

  test('403 feature_disabled maps', () async {
    final a = FakeAdapter({'GET /api/ledger': (o) => const FakeReply(403, {'error': 'x', 'code': 'feature_disabled'})});
    await expectLater(client(a).get('/api/ledger', (j) => j), throwsA(isA<FeatureDisabled>()));
  });

  test('429 keeps server text', () async {
    final a = FakeAdapter({'POST /api/mobile/session': (o) => const FakeReply(429, {'error': 'Too many attempts. Try again in a few minutes.'})});
    final e = await client(a).post('/api/mobile/session', {}, (j) => j).then<Object?>((_) => null, onError: (Object e) => e);
    expect(e, isA<Throttled>());
    expect((e as ApiError).message, 'Too many attempts. Try again in a few minutes.');
  });

  test('500 hides server text', () async {
    final a = FakeAdapter({'GET /api/me': (o) => const FakeReply(500, {'error': 'D1_ERROR: boom'})});
    final e = await client(a).get('/api/me', (j) => j).then<Object?>((_) => null, onError: (Object e) => e);
    expect(e, isA<ServerError>());
    expect((e as ApiError).message, 'Something went wrong. Try again.');
  });

  test('400 keeps server text; 402 is Paused', () async {
    final a = FakeAdapter({
      'POST /api/sales': (o) => const FakeReply(400, {'error': 'Pick a service'}),
      'POST /api/expenses': (o) => const FakeReply(402, {'error': 'x', 'code': 'subscription_inactive'}),
    });
    final e = await client(a).post('/api/sales', {}, (j) => j).then<Object?>((_) => null, onError: (Object e) => e);
    expect(e, isA<Validation>());
    expect((e as ApiError).message, 'Pick a service');
    await expectLater(client(a).post('/api/expenses', {}, (j) => j), throwsA(isA<Paused>()));
  });

  test('sends bearer header', () async {
    final a = FakeAdapter({'GET /api/me': (o) => {'ok': true}});
    expect(await client(a, token: 'skm_abc').get('/api/me', (j) => j), {'ok': true});
    expect(a.calls.single.headers['Authorization'], 'Bearer skm_abc');
    expect(a.calls.single.uri.toString(), 'https://s.salonkit.online/api/me');
  });
}
