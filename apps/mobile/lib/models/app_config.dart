import 'json.dart';

class AppConfig {
  const AppConfig({required this.minVersion, required this.latestVersion, required this.storeUrl});
  final String minVersion, latestVersion, storeUrl;

  factory AppConfig.fromJson(Map<String, dynamic> j) =>
      AppConfig(minVersion: str(j, 'min_version'), latestVersion: str(j, 'latest_version'), storeUrl: str(j, 'store_url'));
}
