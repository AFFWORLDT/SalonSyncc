import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../theme/tokens.dart';
import '../ui/motion.dart';
import 'connectivity_controller.dart';

/// Wraps the app: a thin bar slides up from the bottom while offline ("No internet connection"), turns green
/// ("Back online") for 2 seconds when the connection returns, then slides away.
class OfflineBar extends StatelessWidget {
  const OfflineBar({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = Get.find<ConnectivityController>();
    final p = SkTokens.of(Theme.of(context).brightness);
    return Stack(children: [
      child,
      Positioned(
        left: 0,
        right: 0,
        bottom: 0,
        child: Obx(() {
          final offline = !c.online.value;
          final back = c.backOnline.value;
          final show = offline || back;
          return IgnorePointer(
            child: AnimatedSlide(
              offset: show ? Offset.zero : const Offset(0, 1),
              duration: skDuration(context),
              curve: Curves.easeOutCubic,
              child: AnimatedContainer(
                duration: skDuration(context),
                color: offline ? const Color(0xFF1C1B18) : p.success,
                padding: EdgeInsets.fromLTRB(16, 8, 16, 8 + MediaQuery.paddingOf(context).bottom),
                child: show
                    ? Text(
                        offline ? 'No internet connection' : 'Back online',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500, decoration: TextDecoration.none),
                      )
                    : const SizedBox.shrink(),
              ),
            ),
          );
        }),
      ),
    ]);
  }
}
