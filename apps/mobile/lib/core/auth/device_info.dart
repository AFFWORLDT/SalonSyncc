import 'dart:io';

import 'package:package_info_plus/package_info_plus.dart';

/// What the app tells the server at sign-in. The name is what admins see under "Signed-in phones".
class DeviceInfo {
  const DeviceInfo({required this.name, required this.platform, required this.appVersion});
  final String name, platform, appVersion;

  static Future<DeviceInfo> current() async {
    final v = (await PackageInfo.fromPlatform()).version;
    return Platform.isIOS
        ? DeviceInfo(name: 'iPhone', platform: 'ios', appVersion: v)
        : DeviceInfo(name: 'Android phone', platform: 'android', appVersion: v);
  }
}
