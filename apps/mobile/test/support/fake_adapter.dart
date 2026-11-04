import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

typedef Handler = Object? Function(RequestOptions o);

/// Answers requests from a route table: "METHOD /path" → handler. A handler returns a [FakeReply], a JSON-able value
/// (200), a Future of either (to hold a screen in its loading state), or throws a [DioException] (e.g. to simulate no connection). Every request is recorded in [calls].
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this.routes);

  final Map<String, Handler> routes;
  final calls = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    calls.add(o);
    final h = routes['${o.method} ${o.uri.path}'];
    if (h == null) return _json(404, {'error': 'Not found'});
    var out = h(o);
    if (out is Future) out = await out;
    if (out is FakeReply) return _json(out.status, out.body);
    return _json(200, out);
  }

  ResponseBody _json(int status, Object? body) => ResponseBody.fromString(
        jsonEncode(body),
        status,
        headers: {
          Headers.contentTypeHeader: ['application/json'],
        },
      );

  @override
  void close({bool force = false}) {}
}

class FakeReply {
  const FakeReply(this.status, [this.body]);
  final int status;
  final Object? body;
}

DioException offline(RequestOptions o) => DioException(requestOptions: o, type: DioExceptionType.connectionError);
