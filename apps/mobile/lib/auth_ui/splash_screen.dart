import 'package:flutter/material.dart';

import '../core/auth/session_store.dart';
import '../core/ui/background.dart';
import '../core/ui/salon_logo.dart';

/// Shown while the app starts: the remembered salon's logo, else the SalonKit mark.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key, this.salon});
  final SavedSalon? salon;

  @override
  Widget build(BuildContext context) {
    final s = salon;
    return Scaffold(
      body: SkBackground(
        child: Center(
          child: s != null
              ? Hero(tag: 'salon-logo', child: SalonLogo(slug: s.slug, name: s.name, logoUrl: s.logoUrl, size: 88))
              : Text('SalonKit', style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700)),
        ),
      ),
    );
  }
}
