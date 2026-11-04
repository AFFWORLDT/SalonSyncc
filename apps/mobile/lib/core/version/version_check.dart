import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../models/app_config.dart';
import '../api/api_client.dart';

/// Numeric per part, missing parts count as 0: 1.10.0 is after 1.9.0.
int compareVersions(String a, String b) {
  List<int> parts(String v) => v.split('.').map((p) => int.tryParse(p) ?? 0).toList();
  final pa = parts(a), pb = parts(b);
  for (var i = 0; i < 3; i++) {
    final x = i < pa.length ? pa[i] : 0, y = i < pb.length ? pb[i] : 0;
    if (x != y) return x - y;
  }
  return 0;
}

enum UpdateNeed { none, optional, required }

UpdateNeed needFor(String current, AppConfig c) {
  if (compareVersions(current, c.minVersion) < 0) return UpdateNeed.required;
  if (compareVersions(current, c.latestVersion) < 0) return UpdateNeed.optional;
  return UpdateNeed.none;
}

/// Reads the minimum / latest version from the API at launch. A failed check never blocks the app.
class UpdateController extends GetxController {
  UpdateController({required this.api, required this.platform, required this.currentVersion});
  final ApiClient api;
  final String platform, currentVersion;

  static const _dismissed = 'sk.update.dismissed';
  final need = UpdateNeed.none.obs;
  AppConfig? config;

  Future<void> check() async {
    try {
      final c = await api.get('/api/public/app-config', (j) => AppConfig.fromJson(j as Map<String, dynamic>), query: {'platform': platform});
      config = c;
      var n = needFor(currentVersion, c);
      if (n == UpdateNeed.optional && (await SharedPreferences.getInstance()).getString(_dismissed) == c.latestVersion) n = UpdateNeed.none;
      need.value = n;
    } catch (_) {
      need.value = UpdateNeed.none;
    }
  }

  /// "Not now" on the banner: quiet until a newer latest version is published.
  Future<void> dismiss() async {
    need.value = UpdateNeed.none;
    final v = config?.latestVersion;
    if (v != null) await (await SharedPreferences.getInstance()).setString(_dismissed, v);
  }
}
