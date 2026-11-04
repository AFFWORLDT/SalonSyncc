import 'package:dio/dio.dart';

import 'api_error.dart';

/// JSON calls to one salon's API. Adds the phone token, maps every failure to an [ApiError], and reports a 401 once
/// through [onUnauthorized] (the app then returns to sign-in). Never logs headers or bodies.
class ApiClient {
  ApiClient(this.base, {String? Function()? token, this.onUnauthorized, this.onFeatureDisabled, HttpClientAdapter? adapter, String userAgent = 'SalonKit'})
      : _token = token,
        _dio = Dio(BaseOptions(
          baseUrl: base.toString(),
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 15),
          sendTimeout: const Duration(seconds: 15),
          headers: {'User-Agent': userAgent},
          responseType: ResponseType.json,
        )) {
    if (adapter != null) _dio.httpClientAdapter = adapter;
  }

  final Uri base;
  final void Function()? onUnauthorized;

  /// A switch was turned off since the app last read them: the app re-reads /api/me.
  final void Function()? onFeatureDisabled;
  final String? Function()? _token;
  final Dio _dio;

  Future<T> get<T>(String path, T Function(Object? json) parse, {Map<String, Object?>? query}) =>
      _send('GET', path, null, parse, query);
  Future<T> post<T>(String path, Object? body, T Function(Object? json) parse) => _send('POST', path, body, parse, null);
  Future<T> put<T>(String path, Object? body, T Function(Object? json) parse) => _send('PUT', path, body, parse, null);
  Future<T> delete<T>(String path, T Function(Object? json) parse, {Object? body}) => _send('DELETE', path, body, parse, null);

  /// A raw body (an image upload) with its content type, e.g. "image/jpeg".
  Future<T> putBytes<T>(String path, List<int> bytes, String contentType, T Function(Object? json) parse) =>
      _send('PUT', path, bytes, parse, null, contentType: contentType);

  Future<T> _send<T>(String method, String path, Object? body, T Function(Object? json) parse, Map<String, Object?>? query, {String? contentType}) async {
    final t = _token?.call();
    try {
      final r = await _dio.request<Object?>(
        path,
        data: body,
        queryParameters: query,
        options: Options(method: method, contentType: contentType, headers: {if (t != null) 'Authorization': 'Bearer $t'}),
      );
      return parse(r.data);
    } catch (e) {
      final err = mapError(e);
      if (err is Unauthorized) onUnauthorized?.call();
      if (err is FeatureDisabled) onFeatureDisabled?.call();
      if (err is Offline) networkTrouble.value++;
      throw err;
    }
  }
}
