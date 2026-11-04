/// Small readers that turn a wrong API shape into a FormatException (never a TypeError deep in a screen).
library;

Map<String, dynamic> obj(Object? v, String what) {
  if (v is Map<String, dynamic>) return v;
  throw FormatException('Expected an object for $what');
}

String str(Map<String, dynamic> j, String k) {
  final v = j[k];
  if (v is String) return v;
  throw FormatException('Expected text for $k');
}

String? strOrNull(Map<String, dynamic> j, String k) => j[k] is String ? j[k] as String : null;

int integer(Map<String, dynamic> j, String k) {
  final v = j[k];
  if (v is int) return v;
  throw FormatException('Expected a number for $k');
}

num? numOrNull(Map<String, dynamic> j, String k) => j[k] is num ? j[k] as num : null;
