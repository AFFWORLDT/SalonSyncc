import 'dart:async';

import 'package:get/get.dart';

import '../api/api_error.dart';

const kRetryEvery = Duration(seconds: 5);
const kBackOnlineFor = Duration(seconds: 2);

/// Online or not. Offline when the phone reports no network or a request fails for lack of one; online again only
/// once the API answers ([ping]), retried every [kRetryEvery] while offline.
class ConnectivityController extends GetxController {
  ConnectivityController({required Stream<bool> changes, required this.ping}) : _changes = changes;

  final Stream<bool> _changes;
  final Future<bool> Function() ping;

  final online = true.obs;

  /// The green "Back online" moment after a return.
  final backOnline = false.obs;

  StreamSubscription<bool>? _sub;
  Timer? _retry;
  Timer? _hideBack;

  @override
  void onInit() {
    super.onInit();
    _sub = _changes.listen((has) => has ? _check() : _goOffline());
    networkTrouble.addListener(_goOffline);
  }

  @override
  void onClose() {
    _sub?.cancel();
    _retry?.cancel();
    _hideBack?.cancel();
    networkTrouble.removeListener(_goOffline);
    super.onClose();
  }

  void _goOffline() {
    _hideBack?.cancel();
    backOnline.value = false;
    online.value = false;
    _retry ??= Timer.periodic(kRetryEvery, (_) => _check());
  }

  Future<void> _check() async {
    if (online.value) return;
    bool ok;
    try {
      ok = await ping();
    } catch (_) {
      ok = false;
    }
    if (!ok || online.value) return;
    _retry?.cancel();
    _retry = null;
    online.value = true;
    backOnline.value = true;
    _hideBack = Timer(kBackOnlineFor, () => backOnline.value = false);
  }
}
