import 'package:flutter/material.dart';

import '../core/auth/session_store.dart';
import '../core/ui/splash_art.dart';

/// Shown while the app starts (the session is read and checked): the SalonKit splash art, the same as the opening
/// overlay, so a slow start just keeps the same picture.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key, this.salon});
  final SavedSalon? salon;

  @override
  Widget build(BuildContext context) => const Scaffold(backgroundColor: kSplashCream, body: SplashArt());
}
