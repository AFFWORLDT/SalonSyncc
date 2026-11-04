import 'package:dio/dio.dart';

const kGeneric = 'Something went wrong. Try again.';

/// Every failure the app shows, in plain words. Screens switch on the type; [message] is safe to show.
sealed class ApiError implements Exception {
  const ApiError(this.message);
  final String message;
  @override
  String toString() => message;
}

class Offline extends ApiError {
  const Offline() : super("You're offline");
}

/// 401. Carries the server's words, e.g. "Wrong salon ID, username or password" at sign-in.
class Unauthorized extends ApiError {
  const Unauthorized([super.message = 'Please sign in']);
}

class FeatureDisabled extends ApiError {
  const FeatureDisabled() : super("This feature isn't on for your salon");
}

class Throttled extends ApiError {
  const Throttled(super.message);
}

class Paused extends ApiError {
  const Paused() : super("This salon's account is paused. Contact the salon owner.");
}

class ServerError extends ApiError {
  const ServerError() : super(kGeneric);
}

class Validation extends ApiError {
  const Validation(super.message);
}

ApiError mapError(Object e) {
  if (e is ApiError) return e;
  if (e is! DioException) return const ServerError();
  switch (e.type) {
    case DioExceptionType.connectionError:
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.receiveTimeout:
    case DioExceptionType.sendTimeout:
      return const Offline();
    default:
      break;
  }
  final status = e.response?.statusCode;
  final data = e.response?.data;
  final error = data is Map && data['error'] is String ? data['error'] as String : null;
  final code = data is Map ? data['code'] : null;
  if (status == null) return const ServerError();
  if (status == 401) return Unauthorized(error ?? 'Please sign in');
  if (status == 403 && code == 'feature_disabled') return const FeatureDisabled();
  if (status == 429) return Throttled(error ?? kGeneric);
  if (status == 402) return const Paused();
  if (status >= 500) return const ServerError();
  return Validation(error ?? kGeneric);
}
