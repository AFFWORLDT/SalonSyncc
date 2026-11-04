import 'package:get/get.dart';

import '../../models/me.dart';
import '../features/registry.dart';

/// A push's server path ("/sales/", "/history/", "/") → the module that shows it. Unknown or switched off → home.
String routeForPush(Map<String, dynamic> data, FeatureRegistry r, Me me) {
  var path = data['path'] is String ? data['path'] as String : null;
  if (path == null && data['link'] is String) path = Uri.tryParse(data['link'] as String)?.path;
  final id = (path ?? '/').split('/').firstWhere((s) => s.isNotEmpty, orElse: () => 'home');
  return r.isVisible(id, me) ? id : 'home';
}

/// A module the shell should open (set by a tapped notification); the shell clears it once opened.
final pendingRoute = RxnString();
