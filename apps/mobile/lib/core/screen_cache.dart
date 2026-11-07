import 'package:flutter/scheduler.dart';

/// The last answer each screen showed, in memory, so a screen opens filled and refreshes quietly (Groww-fast).
/// Keys name the screen, the salon, the person and the filters, e.g. 'sales|super|7|day=…'. Cleared on sign-out and
/// switching salon (auth_controller), and in tests.
abstract final class ScreenCache {
  static final _m = <String, Object>{};

  static T? get<T>(String key) {
    final v = _m[key];
    return v is T ? v : null;
  }

  static void put(String key, Object value) {
    if (_m.length > 200) _m.remove(_m.keys.first);
    _m[key] = value;
  }

  static void clear() => _m.clear();
}

/// Applies a cached answer to a screen's state: directly while the framework is building (a load started from
/// initState), otherwise through [setState].
void fillFromCache(void Function(void Function()) setState, void Function() apply) {
  if (SchedulerBinding.instance.schedulerPhase == SchedulerPhase.persistentCallbacks) {
    apply();
  } else {
    setState(apply);
  }
}
