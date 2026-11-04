import 'package:flutter/foundation.dart';

import '../core/push/deep_link.dart';

/// Opens another module from inside a screen (a tab, or its page from "More"), the same way a tapped push does.
void openModule(String id) => pendingRoute.value = id;

/// The day the Sales screen should filter to when it is opened from elsewhere (dashboard, daily sheet).
final salesDayRequest = ValueNotifier<String?>(null);
