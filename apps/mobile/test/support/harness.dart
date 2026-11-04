import 'package:get/get.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/auth/auth_controller.dart';
import 'package:salonkit/core/auth/device_info.dart';
import 'package:salonkit/core/auth/secure_store.dart';
import 'package:salonkit/core/auth/session_store.dart';
import 'package:salonkit/core/theme/theme_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_adapter.dart';

/// Registers an AuthController (and ThemeController) whose every request goes to [a].
AuthController putAuth(FakeAdapter a, {MemorySecureStore? secure, Map<String, Object> prefs = const {}}) {
  SharedPreferences.setMockInitialValues(prefs);
  Get.put(ThemeController());
  return Get.put(AuthController(
    store: SessionStore(secure ?? MemorySecureStore()),
    device: const DeviceInfo(name: 'iPhone', platform: 'ios', appVersion: '1.0.0'),
    clientFor: (b, {token, onUnauthorized, onFeatureDisabled}) =>
        ApiClient(b, token: token, onUnauthorized: onUnauthorized, onFeatureDisabled: onFeatureDisabled, adapter: a),
  ));
}

/// A salon to choose before calls that need one.
class SavedSalonForTest {
  const SavedSalonForTest();
  SavedSalon get salon => const SavedSalon(slug: 'supersalon', name: 'Super Salon');
}
