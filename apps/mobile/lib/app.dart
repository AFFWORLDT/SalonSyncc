import 'package:animations/animations.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'auth_ui/email_start_screen.dart';
import 'auth_ui/login_screen.dart';
import 'auth_ui/splash_screen.dart';
import 'core/auth/auth_controller.dart';
import 'core/features/registry.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_controller.dart';
import 'core/theme/tokens.dart';
import 'core/ui/background.dart';
import 'core/ui/splash_art.dart';
import 'core/ui/motion.dart';
import 'modules/modules.dart';
import 'shell/shell.dart';

/// Hooks later tasks add around the app (offline bar) and the signed-in shell (lock screen).
typedef AppWrapper = Widget Function(BuildContext context, Widget child);
final appWrappers = <AppWrapper>[];

class SalonKitApp extends StatelessWidget {
  const SalonKitApp({super.key, this.registry, this.intro = false});
  final FeatureRegistry? registry;

  /// Show the splash art over the first screen for a moment (the real app; tests leave it off).
  final bool intro;

  @override
  Widget build(BuildContext context) {
    final theme = Get.find<ThemeController>();
    final reg = registry ?? FeatureRegistry(appModules);
    return Obx(() => GetMaterialApp(
          title: 'SalonKit',
          debugShowCheckedModeBanner: false,
          theme: buildTheme(SkTokens.light, Brightness.light),
          darkTheme: buildTheme(SkTokens.dark, Brightness.dark),
          themeMode: theme.mode.value,
          builder: (context, child) {
            final app = appWrappers.fold(child ?? const SizedBox(), (w, wrap) => wrap(context, w));
            return intro ? SplashOverlay(child: app) : app;
          },
          home: _AuthGate(registry: reg),
        ));
  }
}

/// Picks the screen from the sign-in state, with a shared-axis transition between them. Leaving the signed-in state
/// (sign out, a 401, switch salon) and entering it (from a pushed sign-up screen) close every screen opened on top.
class _AuthGate extends StatefulWidget {
  const _AuthGate({required this.registry});
  final FeatureRegistry registry;

  @override
  State<_AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<_AuthGate> {
  final auth = Get.find<AuthController>();
  late final Worker _leave;

  @override
  void initState() {
    super.initState();
    _leave = ever<AuthState>(auth.state, (s) {
      // Any change of sign-in state closes the screens opened on top: signing out leaves nothing above sign-in, and
      // signing in from a screen pushed over it (sign-up, forgot password, Google sign-up) lands on the app.
      Navigator.of(context, rootNavigator: true).popUntil((r) => r.isFirst);
    });
  }

  @override
  void dispose() {
    _leave.dispose();
    super.dispose();
  }

  FeatureRegistry get registry => widget.registry;

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final s = auth.state.value;
      final Widget screen = switch (s) {
        AuthState.unknown => SplashScreen(salon: auth.salon.value),
        AuthState.needSalon => const EmailStartScreen(),
        AuthState.needLogin => const LoginScreen(),
        AuthState.signedIn => SkBackground(child: Shell(registry: registry)),
      };
      return PageTransitionSwitcher(
        duration: skDuration(context, 300),
        transitionBuilder: (child, a, b) => SharedAxisTransition(
          animation: a,
          secondaryAnimation: b,
          transitionType: SharedAxisTransitionType.horizontal,
          fillColor: Colors.transparent,
          child: child,
        ),
        child: KeyedSubtree(key: ValueKey(s), child: screen),
      );
    });
  }
}
